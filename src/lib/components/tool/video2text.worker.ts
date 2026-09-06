/// <reference lib="webworker" />

/**
 * Video-to-text orchestrator. Same shape as upscale.worker.ts /
 * video2mp3.worker.ts: owns the whole pipeline, only talks back to the UI
 * through typed postMessage events.
 *
 * Pipeline:
 *   1. Mediabunny demuxes + decodes the source's audio track to native-rate
 *      planar PCM (no server upload -- same as every other tool here).
 *   2. StreamingMonoResampler mixes to mono and resamples to 16kHz.
 *   3. The 16kHz signal is split into fixed-length chunks (see
 *      $lib/video2text/plan.ts) -- the transducer encoder is an offline
 *      (non-streaming) forward pass, so very long audio has to be windowed
 *      to keep compute/memory bounded.
 *   4. Each chunk: fbank.ts computes normalized log-mel features, then
 *      transducer.ts runs the encoder/decoder/joiner greedy search to get
 *      (token id, frame index) pairs. tokenizer.ts turns those into plain
 *      text and into timestamped words/sentences (frame index -> seconds
 *      via ENCODED_FRAME_DURATION_SEC, offset by the chunk's start time).
 *
 * The three ONNX models + tokens.txt are the multilingual NeMo FastConformer
 * transducer -- too large (~138MB) to bundle as a static asset, so they're
 * fetched from a single zip on first use and cached; see loadModel() below
 * and the doc comment on $lib/video2text/plan.ts.
 */
import { env, InferenceSession } from 'onnxruntime-web';
import { unzipSync } from 'fflate';
import { setupWasmCache, beginOrtDownloadTracking, endOrtDownloadTracking } from './ort-wasm-cache';
import {
	Input,
	BlobSource,
	ALL_FORMATS,
	AudioSampleSink
} from 'mediabunny';
import { MODEL_FILES, MODEL_ZIP_URL, MODEL_ZIP_ENTRY_SUFFIXES, planAudioChunks } from '$lib/video2text/plan';
import { computeNemoFeatures, SAMPLE_RATE, ENCODED_FRAME_DURATION_SEC } from '$lib/video2text/fbank';
import { greedyDecodeChunk, type TransducerSessions } from '$lib/video2text/transducer';
import {
	parseTokens,
	tokensToWords,
	wordsToSegments,
	type Tokenizer,
	type TimedToken
} from '$lib/video2text/tokenizer';
import { segmentsToParagraphs } from '$lib/video2text/paragraphs';
import { StreamingMonoResampler } from '$lib/video2text/resample';

setupWasmCache();
env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/';

// ===================================================================================
// Public message protocol
// ===================================================================================

export type TranscribeRequest = { type: 'transcribe'; file: File };
export type CancelRequest = { type: 'cancel' };

export type TranscribeProgressMessage = {
	type: 'progress';
	/** 0-100 */
	progress: number;
	stage: 'probing' | 'loading-model' | 'decoding-audio' | 'transcribing';
};

export type TranscribeSegment = { text: string; startSec: number; endSec: number };

export type TranscribeDoneMessage = {
	type: 'done';
	/** Full transcript, grouped into paragraphs (blank line between each) --
	 *  see paragraphs.ts. This is what the plain (non-timeline) view shows. */
	text: string;
	/** Sentence-grouped lines with a start timestamp each -- see wordsToSegments. */
	segments: TranscribeSegment[];
	durationSec: number;
};

export type TranscribeErrorMessage = {
	type: 'error';
	message: string;
	code?: 'no_audio';
};

export type WorkerOutMessage = TranscribeProgressMessage | TranscribeDoneMessage | TranscribeErrorMessage;

function post(message: WorkerOutMessage) {
	self.postMessage(message);
}

export class NoAudioTrackError extends Error {}

// ===================================================================================
// Model loading (fetched once per worker lifetime, cached across sessions)
// ===================================================================================

const MODEL_CACHE_NAME = 'video2text-model-cache-v1';

/**
 * The model isn't a static asset (see plan.ts), so there's nothing real to
 * fetch() at MODEL_FILES.encoder etc. -- those strings are used purely as
 * Cache Storage keys here, one per member file extracted from the zip.
 * cache.match()/cache.put() work fine against an arbitrary key string; it
 * never has to resolve to a real network resource.
 */
async function getCachedModelFile(cache: Cache, key: string): Promise<Uint8Array | null> {
	const hit = await cache.match(key).catch(() => undefined);
	if (!hit) return null;
	return new Uint8Array(await hit.arrayBuffer());
}

/**
 * Downloads the whole model zip with real byte-level progress (0-1, capped
 * just under 1 until the stream actually finishes -- same pattern as
 * ort-wasm-cache.ts's tracked read loop). ~103MB, so this is the dominant
 * cost of a first-ever model load by a wide margin; unzipping and caching
 * the extracted files afterwards is comparatively instant.
 */
async function downloadZip(url: string, onProgress: (fraction: number) => void): Promise<Uint8Array> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Could not download the speech model (${response.status})`);

	const total = Number(response.headers.get('content-length')) || 0;
	const reader = response.body?.getReader();
	if (!reader) {
		const buf = new Uint8Array(await response.arrayBuffer());
		onProgress(1);
		return buf;
	}

	const chunks: Uint8Array[] = [];
	let received = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		received += value.length;
		if (total > 0) onProgress(Math.min(0.99, received / total));
	}
	onProgress(1);

	const combined = new Uint8Array(received);
	let offset = 0;
	for (const chunk of chunks) {
		combined.set(chunk, offset);
		offset += chunk.length;
	}
	return combined;
}

let cachedSessions: TransducerSessions | null = null;
let cachedTokenizer: Tokenizer | null = null;

async function loadModel(onProgress: (fraction: number) => void): Promise<void> {
	if (cachedSessions && cachedTokenizer) {
		onProgress(1);
		return;
	}

	const cache = await caches.open(MODEL_CACHE_NAME).catch(() => null);

	// Fast path: a previous run already unzipped and cached every member
	// file individually -- skip the network and fflate entirely.
	let encoderBuf = cache && (await getCachedModelFile(cache, MODEL_FILES.encoder));
	let decoderBuf = cache && (await getCachedModelFile(cache, MODEL_FILES.decoder));
	let joinerBuf = cache && (await getCachedModelFile(cache, MODEL_FILES.joiner));
	let tokensBuf = cache && (await getCachedModelFile(cache, MODEL_FILES.tokens));

	if (!encoderBuf || !decoderBuf || !joinerBuf || !tokensBuf) {
		// Download dominates this stage -- give it 0-95% of the bar and leave
		// the tail for unzip + writing the extracted files back to the cache.
		const zipBytes = await downloadZip(MODEL_ZIP_URL, (fraction) => onProgress(fraction * 0.95));

		const entries = unzipSync(zipBytes);
		const findEntry = (suffix: string): Uint8Array => {
			const name = Object.keys(entries).find((n) => n.endsWith(suffix));
			if (!name) throw new Error(`Model archive is missing a "${suffix}" file`);
			return entries[name];
		};

		encoderBuf = findEntry(MODEL_ZIP_ENTRY_SUFFIXES.encoder);
		decoderBuf = findEntry(MODEL_ZIP_ENTRY_SUFFIXES.decoder);
		joinerBuf = findEntry(MODEL_ZIP_ENTRY_SUFFIXES.joiner);
		tokensBuf = findEntry(MODEL_ZIP_ENTRY_SUFFIXES.tokens);

		if (cache) {
			const put = (key: string, bytes: Uint8Array) =>
				cache
					.put(key, new Response(bytes.slice(), { headers: { 'Content-Type': 'application/octet-stream' } }))
					.catch(() => {
						// Storage quota errors etc. are non-fatal -- just means no
						// caching this time, next load re-downloads the zip.
					});
			await Promise.all([
				put(MODEL_FILES.encoder, encoderBuf),
				put(MODEL_FILES.decoder, decoderBuf),
				put(MODEL_FILES.joiner, joinerBuf),
				put(MODEL_FILES.tokens, tokensBuf)
			]);
		}
	}

	onProgress(1);

	beginOrtDownloadTracking(() => {
		// The ORT wasm runtime is tiny next to the model itself and this stage
		// has no visible bar segment of its own -- just let it ride along
		// silently rather than juggling a second weighted number for it.
	});
	try {
		const [encoder, decoder, joiner] = await Promise.all([
			InferenceSession.create(encoderBuf!),
			InferenceSession.create(decoderBuf!),
			InferenceSession.create(joinerBuf!)
		]);
		cachedSessions = { encoder, decoder, joiner };
	} finally {
		endOrtDownloadTracking();
	}

	// Non-null: either the cache hits above already had all four, or the
	// if-block just downloaded+unzipped+assigned all four -- one of those
	// two paths always runs before this point.
	cachedTokenizer = parseTokens(new TextDecoder().decode(tokensBuf!));
	onProgress(1);
}

// ===================================================================================
// Audio extraction: demux + decode + resample to 16kHz mono
// ===================================================================================

async function extractMonoPcm16k(
	file: File,
	onProgress: (fraction: number) => void,
	signal: AbortSignal
): Promise<{ samples: Float32Array; durationSec: number }> {
	const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });

	let audioTrack;
	try {
		audioTrack = await input.getPrimaryAudioTrack();
	} catch {
		throw new NoAudioTrackError('This file could not be read as audio/video');
	}
	if (!audioTrack) throw new NoAudioTrackError('This file has no audio track');

	const durationSec = await input.computeDuration();
	const sink = new AudioSampleSink(audioTrack);
	const resampler = new StreamingMonoResampler(SAMPLE_RATE);

	// AudioSample.copyTo('f32-planar') rather than sample.toAudioBuffer() /
	// Mediabunny's AudioBufferSink -- the DOM AudioBuffer constructor isn't
	// available in a Worker's global scope, only on Window (see the doc
	// comment on StreamingMonoResampler for the full story).
	for await (const sample of sink.samples()) {
		if (signal.aborted) {
			sample.close();
			throw new DOMException('Aborted', 'AbortError');
		}

		const numberOfChannels = sample.numberOfChannels;
		const numberOfFrames = sample.numberOfFrames;
		const channelData: Float32Array[] = [];
		for (let c = 0; c < numberOfChannels; c++) {
			const plane = new Float32Array(numberOfFrames);
			sample.copyTo(plane, { planeIndex: c, format: 'f32-planar' });
			channelData.push(plane);
		}

		resampler.push({
			sampleRate: sample.sampleRate,
			numberOfChannels,
			numberOfFrames,
			channelData
		});

		if (durationSec > 0) onProgress(Math.min(1, sample.timestamp / durationSec));
		sample.close();
	}
	onProgress(1);

	return { samples: resampler.finish(), durationSec };
}

// ===================================================================================
// Orchestration
// ===================================================================================

let abortController: AbortController | null = null;

async function transcribe(request: TranscribeRequest) {
	const { file } = request;

	abortController?.abort();
	abortController = new AbortController();
	const { signal } = abortController;

	post({ type: 'progress', progress: 0, stage: 'probing' });

	post({ type: 'progress', progress: 0, stage: 'loading-model' });
	await loadModel((fraction) => {
		post({ type: 'progress', progress: Math.round(fraction * 100), stage: 'loading-model' });
	});
	if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

	post({ type: 'progress', progress: 0, stage: 'decoding-audio' });
	const { samples, durationSec } = await extractMonoPcm16k(
		file,
		(fraction) => post({ type: 'progress', progress: Math.round(fraction * 100), stage: 'decoding-audio' }),
		signal
	);
	if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

	const sessions = cachedSessions!;
	const tokenizer = cachedTokenizer!;

	const { startSamples, chunkLengthSamples } = planAudioChunks(samples.length, SAMPLE_RATE);
	const allTimedTokens: TimedToken[] = [];

	for (let i = 0; i < startSamples.length; i++) {
		if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

		const start = startSamples[i];
		const end = Math.min(samples.length, start + chunkLengthSamples);
		const chunk = samples.subarray(start, end);
		const chunkStartSec = start / SAMPLE_RATE;

		const { data, numFrames } = computeNemoFeatures(chunk);
		const tokens = await greedyDecodeChunk(sessions, data, numFrames, tokenizer.blankId, () => {
			const chunkFraction = (i + 1) / startSamples.length;
			post({ type: 'progress', progress: Math.round(chunkFraction * 100), stage: 'transcribing' });
		});

		for (const t of tokens) {
			allTimedTokens.push({
				piece: tokenizer.pieces[t.id] ?? '',
				timeSec: chunkStartSec + t.frameIndex * ENCODED_FRAME_DURATION_SEC
			});
		}
	}

	const words = tokensToWords(allTimedTokens);
	const segments = wordsToSegments(words);
	const paragraphs = segmentsToParagraphs(segments);

	post({ type: 'done', text: paragraphs.join('\n\n'), segments, durationSec });
}

self.onmessage = (event: MessageEvent<TranscribeRequest | CancelRequest>) => {
	const data = event.data;

	if (data.type === 'cancel') {
		abortController?.abort();
		abortController = null;
		return;
	}

	if (data.type !== 'transcribe') return;

	transcribe(data).catch((error: unknown) => {
		if (error instanceof DOMException && error.name === 'AbortError') return;
		if (abortController?.signal.aborted) return;

		if (error instanceof NoAudioTrackError) {
			post({ type: 'error', message: error.message, code: 'no_audio' });
			return;
		}
		console.error('[video2text.worker] transcription failed:', error);
		post({ type: 'error', message: error instanceof Error ? error.message : 'Transcription failed' });
	});
};

export {};

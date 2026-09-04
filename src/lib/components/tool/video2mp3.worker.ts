/// <reference lib="webworker" />

/**
 * Video -> MP3 orchestrator. Runs off the main thread so the UI stays
 * responsive through what can be a slow ffmpeg.wasm encode.
 *
 * Responsibilities:
 *   1. Probe the source and route it to an engine (Mediabunny when this
 *      browser can encode MP3 natively, ffmpeg.wasm otherwise).
 *   2. Ask the planner what bitrate/channels/sample rate to encode at.
 *   3. Run the conversion and report progress back to the UI.
 *
 * Structurally a smaller sibling of compress.worker.ts -- no target-size
 * verification loop is needed here since MP3 bitrate is a direct, exact
 * encoder parameter, not something that has to be searched for.
 */
import {
	planForQuality,
	type ConversionPlan,
	type Mp3Quality,
	type SourceAudioInfo
} from '$lib/video2mp3/plan';
import {
	canEncodeMp3Natively,
	convertWithMediabunny,
	NoAudioTrackError,
	probe as probeWithMediabunny,
	UnsupportedByMediabunnyError
} from '$lib/video2mp3/mediabunny';
import { convertWithFfmpeg, needsFfmpeg, probeWithFfmpeg } from '$lib/video2mp3/ffmpeg';
import { ConversionCanceledError } from 'mediabunny';

export type ConvertRequest = {
	type: 'convert';
	file: File;
	quality: Mp3Quality;
};

export type CancelRequest = { type: 'cancel' };

export type ConvertProgressMessage = {
	type: 'progress';
	/** 0-100 */
	progress: number;
	stage: 'probing' | 'loading-engine' | 'encoding';
};

export type ConvertDoneMessage = {
	type: 'done';
	blob: Blob;
	fileName: string;
	originalBytes: number;
	convertedBytes: number;
	durationSec: number;
	engine: 'mediabunny' | 'ffmpeg';
};

export type ConvertErrorMessage = {
	type: 'error';
	message: string;
	/** Set when the file simply has no audio track -- a distinct UI message. */
	code?: 'no_audio';
};

export type WorkerOutMessage = ConvertProgressMessage | ConvertDoneMessage | ConvertErrorMessage;

let abortController: AbortController | null = null;
// Kept separately from `abortController` for the same reason as
// compress.worker.ts: the cancel handler nulls that one out synchronously,
// while the in-flight convert() promise is still using the AbortSignal it
// captured at start.
let currentSignal: AbortSignal | null = null;

function post(message: WorkerOutMessage) {
	self.postMessage(message);
}

function outputName(original: string): string {
	const base = original.replace(/\.[^.]+$/, '') || 'audio';
	return `${base}.mp3`;
}

type Engine = 'mediabunny' | 'ffmpeg';

async function resolveEngineAndSource(
	file: File,
	quality: Mp3Quality,
	onLoadProgress: (fraction: number) => void
): Promise<{ engine: Engine; source: SourceAudioInfo }> {
	// Known-unsupported containers: skip the Mediabunny attempt entirely.
	if (needsFfmpeg(file.name)) {
		const source = await probeWithFfmpeg(file, onLoadProgress);
		if (!source.hasAudio) throw new NoAudioTrackError('This file has no audio track');
		return { engine: 'ffmpeg', source };
	}

	try {
		const source = await probeWithMediabunny(file);
		// The only reason a readable container goes to ffmpeg instead: this
		// browser has no native MP3 encoder for WebCodecs to use.
		if (await canEncodeMp3Natively(quality * 1000)) {
			return { engine: 'mediabunny', source };
		}
		return { engine: 'ffmpeg', source };
	} catch (error) {
		if (error instanceof UnsupportedByMediabunnyError) {
			const source = await probeWithFfmpeg(file, onLoadProgress);
			if (!source.hasAudio) throw new NoAudioTrackError('This file has no audio track');
			return { engine: 'ffmpeg', source };
		}
		throw error;
	}
}

async function runConversion(
	engine: Engine,
	file: File,
	plan: ConversionPlan,
	signal: AbortSignal
): Promise<Blob> {
	const onProgress = (fraction: number) =>
		post({ type: 'progress', progress: Math.round(fraction * 100), stage: 'encoding' });

	if (engine === 'mediabunny') {
		return convertWithMediabunny(file, plan, onProgress, signal);
	}
	return convertWithFfmpeg(
		file,
		plan,
		onProgress,
		(stage, fraction) =>
			post({
				type: 'progress',
				progress: Math.round(fraction * 100),
				stage: stage === 'loading' ? 'loading-engine' : 'encoding'
			}),
		signal
	);
}

async function convert(request: ConvertRequest) {
	const { file, quality } = request;

	abortController?.abort();
	abortController = new AbortController();
	const { signal } = abortController;
	currentSignal = signal;

	post({ type: 'progress', progress: 0, stage: 'probing' });
	const { engine, source } = await resolveEngineAndSource(file, quality, (fraction) =>
		post({ type: 'progress', progress: Math.round(fraction * 100), stage: 'loading-engine' })
	);

	const plan = planForQuality(source, quality);
	const blob = await runConversion(engine, file, plan, signal);

	post({
		type: 'done',
		blob,
		fileName: outputName(file.name),
		originalBytes: file.size,
		convertedBytes: blob.size,
		durationSec: source.durationSec,
		engine
	});
}

self.onmessage = (event: MessageEvent<ConvertRequest | CancelRequest>) => {
	const data = event.data;

	if (data.type === 'cancel') {
		abortController?.abort();
		abortController = null;
		return;
	}

	if (data.type !== 'convert') return;

	convert(data).catch((error: unknown) => {
		if (signalWasAborted(error) || currentSignal?.aborted) return;

		if (error instanceof NoAudioTrackError) {
			post({ type: 'error', message: error.message, code: 'no_audio' });
			return;
		}

		console.error('[video2mp3.worker] conversion failed:', error);
		post({
			type: 'error',
			message: error instanceof Error ? error.message : 'Conversion failed'
		});
	});
};

function signalWasAborted(error: unknown): boolean {
	if (error instanceof ConversionCanceledError) return true;
	if (error instanceof DOMException && error.name === 'AbortError') return true;
	// See the matching comment in compress.worker.ts: ffmpeg.terminate()
	// rejects every pending call with a plain Error, not one of the two
	// recognizable shapes above.
	if (error instanceof Error && error.message === 'called FFmpeg.terminate()') return true;
	return false;
}

export {};

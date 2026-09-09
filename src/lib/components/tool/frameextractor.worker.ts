/// <reference lib="webworker" />

/**
 * Frame Extractor orchestrator. Runs off the main thread since decoding
 * frames (and, on the ffmpeg fallback, re-seeking the source once per
 * requested timestamp) can take a noticeable moment for a large file or a
 * long list of timestamps.
 *
 * Structural sibling of compress.worker.ts and video2gif.worker.ts:
 *   1. Probe the source and route it to an engine -- Mediabunny for
 *      containers it can demux, ffmpeg.wasm for the legacy ones it can't
 *      (same `needsFfmpeg`/catch-and-fall-back split as compress.worker.ts's
 *      resolveEngineAndSource, minus the "can this browser's hardware
 *      encoder handle it" branch -- that only matters for *encoding* video,
 *      and this tool never encodes video, only still images).
 *   2. Ask the planner (plan.ts) which timestamps to grab.
 *   3. Extract every frame, then package the result: a single frame comes
 *      back as a plain Blob; more than one gets zipped with fflate so the
 *      UI only ever hands back one downloadable file.
 *
 * Two request types, same shape as video2gif.worker.ts: 'probe' fires the
 * moment a file is picked so the UI can size the scrubber/trim controls and
 * seed defaults; 'extract' does the actual work once the user hits go.
 */
import { zipSync } from 'fflate';
import {
	singleFrameFileName,
	zipFileName,
	frameEntryFileName,
	type FrameExtractOptions,
	type SourceVideoInfo
} from '$lib/frameextractor/plan';
import {
	extractFramesWithMediabunny,
	NoVideoTrackError,
	probe as probeWithMediabunny,
	UnsupportedByMediabunnyError,
	type ExtractedFrame
} from '$lib/frameextractor/mediabunny';
import { extractFramesWithFfmpeg, needsFfmpeg, probeWithFfmpeg } from '$lib/frameextractor/ffmpeg';

export type ProbeRequest = { type: 'probe'; file: File };
export type ExtractRequest = { type: 'extract'; file: File; options: FrameExtractOptions };
export type CancelRequest = { type: 'cancel' };

export type ProbedMessage = { type: 'probed'; source: SourceVideoInfo };

export type ExtractStage = 'probing' | 'loading-engine' | 'decoding' | 'encoding' | 'packaging';

export type ExtractProgressMessage = {
	type: 'progress';
	/** 0-100 */
	progress: number;
	stage: ExtractStage;
};

export type ExtractDoneMessage = {
	type: 'done';
	blob: Blob;
	fileName: string;
	isZip: boolean;
	frameCount: number;
	originalBytes: number;
	resultBytes: number;
	/** Individual frame blobs, present when isZip is true, so the UI can show a gallery alongside the zip download. */
	frames?: { blob: Blob; fileName: string }[];
};

export type ExtractErrorMessage = {
	type: 'error';
	message: string;
	code?: 'no_video' | 'unsupported_container';
};

export type WorkerOutMessage = ProbedMessage | ExtractProgressMessage | ExtractDoneMessage | ExtractErrorMessage;

type Engine = 'mediabunny' | 'ffmpeg';

let abortController: AbortController | null = null;
// Kept separately from `abortController` for the same reason as every other
// worker in this codebase: the cancel handler nulls that one out
// synchronously, while the in-flight extract() promise is still using the
// AbortSignal it captured at start.
let currentSignal: AbortSignal | null = null;

function post(message: WorkerOutMessage) {
	self.postMessage(message);
}

function reportError(error: unknown) {
	if (error instanceof NoVideoTrackError) {
		post({ type: 'error', message: error.message, code: 'no_video' });
		return;
	}
	if (error instanceof UnsupportedByMediabunnyError) {
		post({ type: 'error', message: error.message, code: 'unsupported_container' });
		return;
	}
	console.error('[frameextractor.worker] failed:', error);
	post({
		type: 'error',
		message: error instanceof Error ? error.message : 'Frame extraction failed'
	});
}

async function resolveEngineAndSource(
	file: File,
	onLoadProgress: (fraction: number) => void
): Promise<{ engine: Engine; source: SourceVideoInfo }> {
	// Known-unsupported containers: skip the Mediabunny attempt entirely,
	// same as compress.worker.ts.
	if (needsFfmpeg(file.name)) {
		return { engine: 'ffmpeg', source: await probeWithFfmpeg(file, onLoadProgress) };
	}

	try {
		const source = await probeWithMediabunny(file);
		return { engine: 'mediabunny', source };
	} catch (error) {
		if (error instanceof UnsupportedByMediabunnyError) {
			return { engine: 'ffmpeg', source: await probeWithFfmpeg(file, onLoadProgress) };
		}
		throw error;
	}
}

async function handleProbe(request: ProbeRequest) {
	try {
		const { source } = await resolveEngineAndSource(request.file, (fraction) =>
			post({ type: 'progress', progress: Math.round(fraction * 100), stage: 'loading-engine' })
		);
		post({ type: 'probed', source });
	} catch (error) {
		reportError(error);
	}
}

async function handleExtract(request: ExtractRequest) {
	const { file, options } = request;

	abortController?.abort();
	abortController = new AbortController();
	const { signal } = abortController;
	currentSignal = signal;

	try {
		post({ type: 'progress', progress: 0, stage: 'probing' });
		const { engine, source } = await resolveEngineAndSource(file, (fraction) =>
			post({ type: 'progress', progress: Math.round(fraction * 100), stage: 'loading-engine' })
		);

		let frames: ExtractedFrame[];
		if (engine === 'mediabunny') {
			frames = await extractFramesWithMediabunny(
				file,
				source,
				options,
				(fraction) => post({ type: 'progress', progress: Math.round(fraction * 100), stage: 'decoding' }),
				signal
			);
		} else {
			frames = await extractFramesWithFfmpeg(
				file,
				source,
				options,
				(fraction) => post({ type: 'progress', progress: Math.round(fraction * 100), stage: 'encoding' }),
				(stage, fraction) =>
					post({
						type: 'progress',
						progress: Math.round(fraction * 100),
						stage: stage === 'loading' ? 'loading-engine' : 'encoding'
					}),
				signal
			);
		}

		if (frames.length === 1) {
			const frame = frames[0];
			post({
				type: 'done',
				blob: frame.blob,
				fileName: singleFrameFileName(file.name, frame.timestampSec, options.format),
				isZip: false,
				frameCount: 1,
				originalBytes: file.size,
				resultBytes: frame.blob.size
			});
			return;
		}

		post({ type: 'progress', progress: 0, stage: 'packaging' });
		const zipEntries: Record<string, Uint8Array> = {};
		const frameList: { blob: Blob; fileName: string }[] = [];
		for (let i = 0; i < frames.length; i++) {
			if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
			const name = frameEntryFileName(i, frames[i].timestampSec, options.format, frames.length);
			zipEntries[name] = new Uint8Array(await frames[i].blob.arrayBuffer());
			frameList.push({ blob: frames[i].blob, fileName: name });
			post({ type: 'progress', progress: Math.round(((i + 1) / frames.length) * 100), stage: 'packaging' });
		}
		const zipped = zipSync(zipEntries);
		const blob = new Blob([zipped], { type: 'application/zip' });

		post({
			type: 'done',
			blob,
			fileName: zipFileName(file.name),
			isZip: true,
			frameCount: frames.length,
			originalBytes: file.size,
			resultBytes: blob.size,
			frames: frameList
		});
	} catch (error) {
		if (signalWasAborted(error) || currentSignal?.aborted) return;
		reportError(error);
	}
}

self.onmessage = (event: MessageEvent<ProbeRequest | ExtractRequest | CancelRequest>) => {
	const data = event.data;

	if (data.type === 'cancel') {
		abortController?.abort();
		abortController = null;
		return;
	}

	if (data.type === 'probe') {
		handleProbe(data);
		return;
	}

	if (data.type === 'extract') {
		handleExtract(data);
	}
};

function signalWasAborted(error: unknown): boolean {
	if (error instanceof DOMException && error.name === 'AbortError') return true;
	// See the matching comment in compress.worker.ts: ffmpeg.terminate()
	// (called on cancel) rejects every pending ffmpeg call with a plain
	// Error, not one of the types above.
	if (error instanceof Error && error.message === 'called FFmpeg.terminate()') return true;
	return false;
}

export {};

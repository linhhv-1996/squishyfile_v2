/// <reference lib="webworker" />

/**
 * Video -> GIF orchestrator. Runs off the main thread since decoding every
 * sampled frame, quantizing a palette and LZW-encoding the result can take
 * a while for longer/bigger clips.
 *
 * Structural sibling of video2mp3.worker.ts, simplified in the opposite
 * direction MP3 was: there's only ever one engine here (Mediabunny +
 * gifenc), no ffmpeg.wasm fallback yet. That means containers Mediabunny
 * can't demux (AVI, WMV, FLV, ...) aren't supported by this first pass --
 * an acceptable gap for a tool literally named "MP4 to GIF" whose primary
 * inputs (MP4/MOV/WebM) Mediabunny already reads natively. Follow-up work
 * can port ffmpeg.ts over the same way the MP3 tool does if that turns out
 * to matter.
 *
 * Two request types: 'probe' fires the moment a file is picked so the UI
 * can size the trim timeline and seed default options before the user
 * touches anything; 'convert' does the actual encode once they hit go.
 */
import {
	planDimensions,
	planFrameTimestamps,
	type GifOptions,
	type SourceVideoInfo
} from '$lib/video2gif/plan';
import {
	convertWithMediabunny,
	NoVideoTrackError,
	probe,
	UnsupportedByMediabunnyError,
	type GifProgressStage
} from '$lib/video2gif/mediabunny';

export type ProbeRequest = { type: 'probe'; file: File };
export type ConvertRequest = { type: 'convert'; file: File; options: GifOptions };
export type CancelRequest = { type: 'cancel' };

export type ProbedMessage = { type: 'probed'; source: SourceVideoInfo };

export type ConvertProgressMessage = {
	type: 'progress';
	/** 0-100 */
	progress: number;
	stage: GifProgressStage;
};

export type ConvertDoneMessage = {
	type: 'done';
	blob: Blob;
	fileName: string;
	originalBytes: number;
	convertedBytes: number;
	width: number;
	height: number;
	frameCount: number;
	durationSec: number;
};

export type ConvertErrorMessage = {
	type: 'error';
	message: string;
	/** Set for the two distinguishable failure shapes -- a distinct UI message each. */
	code?: 'no_video' | 'unsupported_container';
};

export type WorkerOutMessage =
	| ProbedMessage
	| ConvertProgressMessage
	| ConvertDoneMessage
	| ConvertErrorMessage;

let abortController: AbortController | null = null;
// Kept separately from `abortController` for the same reason as
// video2mp3.worker.ts: the cancel handler nulls that one out synchronously,
// while the in-flight convert() promise is still using the AbortSignal it
// captured at start.
let currentSignal: AbortSignal | null = null;

function post(message: WorkerOutMessage) {
	self.postMessage(message);
}

function outputName(original: string): string {
	const base = original.replace(/\.[^.]+$/, '') || 'video';
	return `${base}.gif`;
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
	console.error('[video2gif.worker] failed:', error);
	post({
		type: 'error',
		message: error instanceof Error ? error.message : 'Conversion failed'
	});
}

async function handleProbe(request: ProbeRequest) {
	try {
		const source = await probe(request.file);
		post({ type: 'probed', source });
	} catch (error) {
		reportError(error);
	}
}

async function handleConvert(request: ConvertRequest) {
	const { file, options } = request;

	abortController?.abort();
	abortController = new AbortController();
	const { signal } = abortController;
	currentSignal = signal;

	try {
		const source = await probe(file);
		const blob = await convertWithMediabunny(
			file,
			source,
			options,
			(stage, fraction) => post({ type: 'progress', progress: Math.round(fraction * 100), stage }),
			signal
		);

		const { width, height } = planDimensions(source, options);
		post({
			type: 'done',
			blob,
			fileName: outputName(file.name),
			originalBytes: file.size,
			convertedBytes: blob.size,
			width,
			height,
			frameCount: planFrameTimestamps(options).length,
			durationSec: source.durationSec
		});
	} catch (error) {
		if (signalWasAborted(error) || currentSignal?.aborted) return;
		reportError(error);
	}
}

self.onmessage = (event: MessageEvent<ProbeRequest | ConvertRequest | CancelRequest>) => {
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

	if (data.type === 'convert') {
		handleConvert(data);
	}
};

function signalWasAborted(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'AbortError';
}

export {};

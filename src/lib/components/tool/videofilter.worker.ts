/// <reference lib="webworker" />

/**
 * VHS-effect orchestrator. Same shape as compress.worker.ts /
 * upscale.worker.ts: owns the whole pipeline off the main thread and only
 * talks back to the UI through typed postMessage events.
 *
 * Unlike the upscaler (which routes between an ONNX model and a WebGPU FSR
 * pipeline depending on resolution), this is always the same single-pass
 * WebGL2 fragment shader from $lib/vhs/shader.ts, driven by the style
 * presets in $lib/vhs/plan.ts. Mediabunny decodes the source into
 * `VideoSample`s and re-encodes whatever `process()` returns, so all this
 * file has to do is: run each sample through the shader on an
 * OffscreenCanvas, and hand that canvas back.
 */
import {
	Input,
	Output,
	Conversion,
	BlobSource,
	StreamTarget,
	Mp4OutputFormat,
	ALL_FORMATS,
	Quality,
	VideoSample,
	ConversionCanceledError,
	type StreamTargetChunk
} from 'mediabunny';
import { VhsRenderer } from '$lib/vhs/gl-renderer';
import type { VhsStyle } from '$lib/vhs/plan';

// ===================================================================================
// Public message protocol (mirrors compress.worker.ts / upscale.worker.ts)
// ===================================================================================

export type VhsRequest = {
	type: 'process';
	file: File;
	style: VhsStyle;
};

export type CancelRequest = { type: 'cancel' };

export type VhsProgressMessage = {
	type: 'progress';
	/** 0-100 */
	progress: number;
	stage: 'probing' | 'encoding';
};

export type VhsDoneMessage = {
	type: 'done';
	blob: Blob;
	fileName: string;
	originalBytes: number;
	newBytes: number;
	width: number;
	height: number;
	style: VhsStyle;
};

export type VhsErrorMessage = { type: 'error'; message: string };

export type WorkerOutMessage = VhsProgressMessage | VhsDoneMessage | VhsErrorMessage;

function post(message: WorkerOutMessage) {
	self.postMessage(message);
}

// ===================================================================================
// Frame size helper (same logic as upscale.worker.ts's getFrameSize)
// ===================================================================================

function getFrameSize(source: CanvasImageSource): { width: number; height: number } {
	if ('displayWidth' in source) {
		return { width: (source as VideoFrame).displayWidth, height: (source as VideoFrame).displayHeight };
	}
	return { width: source.width as number, height: source.height as number };
}

function outputName(original: string, style: VhsStyle): string {
	const dot = original.lastIndexOf('.');
	const base = dot > 0 ? original.slice(0, dot) : original;
	return `${base}-vhs-${style}.mp4`;
}

// ===================================================================================
// Frame rendering -- one shared VhsRenderer (see $lib/vhs/gl-renderer.ts)
// reused for every frame of the run, resizing itself if the source
// resolution ever changes.
// ===================================================================================

let renderer: VhsRenderer | null = null;

function processFrame(sample: VideoSample, style: VhsStyle): OffscreenCanvas {
	const source = sample.toCanvasImageSource();
	const { width, height } = getFrameSize(source);
	if (!renderer) renderer = new VhsRenderer(new OffscreenCanvas(width, height));
	return renderer.render(source as TexImageSource, width, height, style, sample.timestamp) as OffscreenCanvas;
}

// ===================================================================================
// Conversion pipeline
// ===================================================================================

let abortController: AbortController | null = null;
let currentSignal: AbortSignal | null = null;
// Tracks the OPFS scratch file backing the most recently *successful*
// run's Blob. It's deliberately not deleted right after that run finishes
// (see the comment further down for why) -- instead it's cleaned up here,
// the next time a run starts.
let lastSuccessfulTempFileName: string | null = null;

async function runVhsEffect(request: VhsRequest) {
	const { file, style } = request;

	abortController?.abort();
	abortController = new AbortController();
	const { signal } = abortController;
	currentSignal = signal;

	post({ type: 'progress', progress: 0, stage: 'probing' });

	const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
	const primaryVideoTrack = await input.getPrimaryVideoTrack();
	if (!primaryVideoTrack) throw new Error('No video track found in file.');

	const srcWidth = await primaryVideoTrack.getDisplayWidth();
	const srcHeight = await primaryVideoTrack.getDisplayHeight();

	post({ type: 'progress', progress: 0, stage: 'encoding' });

	// Mediabunny's BufferTarget writes into a single in-memory ArrayBuffer,
	// which browsers cap at 4 GiB -- a real ceiling here, since longer or
	// higher-res clips push past it easily, and the grain/noise this filter
	// adds works against the encoder's compression, inflating output size
	// further. Writing to a scratch file in the Origin Private File System
	// instead has no such limit (it's disk-backed, not a JS ArrayBuffer),
	// and sync access handles -- the fast, synchronous way to read/write
	// OPFS files -- are only available in dedicated workers, which is
	// exactly where this code runs.
	const opfsRoot = await navigator.storage.getDirectory();

	// The previous run's exported file is only ever reachable through a
	// `URL.createObjectURL()` in the main thread, and that object URL is
	// already revoked the moment a new run starts (see revokeResult() in
	// VideoFilter.svelte, called from startProcessing() before this worker
	// is even messaged) -- so it's safe to remove the backing file here.
	if (lastSuccessfulTempFileName) {
		await opfsRoot.removeEntry(lastSuccessfulTempFileName).catch(() => {});
		lastSuccessfulTempFileName = null;
	}

	// Unique per run so a fast cancel-then-restart can never collide with
	// the previous run's still-closing handle (OPFS sync access handles
	// hold an exclusive lock on their file).
	const tempFileName = `vhs-export-${crypto.randomUUID()}.mp4`;
	const tempFileHandle = await opfsRoot.getFileHandle(tempFileName, { create: true });
	const syncAccessHandle = await tempFileHandle.createSyncAccessHandle();
	let handleClosed = false;
	const closeHandleOnce = () => {
		if (handleClosed) return;
		handleClosed = true;
		try {
			syncAccessHandle.close();
		} catch {
			/* already closed */
		}
	};

	try {
		const writable = new WritableStream<StreamTargetChunk>({
			write(chunk) {
				syncAccessHandle.write(chunk.data, { at: chunk.position });
			}
		});
		const output = new Output({
			format: new Mp4OutputFormat(),
			target: new StreamTarget(writable, { chunked: true })
		});

		const conversion = await Conversion.init({
			input,
			output,
			video: {
				codec: 'avc',
				// See upscale.worker.ts for why this is disabled: our process()
				// callback already draws using *display* dimensions, so the
				// canvas we return is already correctly oriented -- letting
				// Mediabunny also stamp the input's rotation matrix onto the
				// output container would rotate it a second time on playback.
				allowRotationMetadata: false,
				// `preferBitrate` forces a resolution-scaled *bitrate* target
				// instead of letting Mediabunny pick a fixed quantizer for
				// 'high'. A fixed quantizer aims for constant per-pixel
				// quality no matter what it costs -- fine for ordinary
				// footage, but our shader output (animated per-frame grain,
				// hard-edged line art in the pencil/cross-hatch filters) is
				// close to worst-case content for a video codec, and a
				// constant-quantizer encode was blowing up to multiple GB
				// for a single short clip. A bounded bitrate keeps output
				// size predictable regardless of how compressible the
				// chosen style's look happens to be.
				quality: new Quality({ quality: 'high', preferBitrate: true }),
				process: async (sample: VideoSample) => processFrame(sample, style)
			},
			audio: {
				codec: 'aac',
				quality: new Quality('high')
			}
		});

		if (!conversion.isValid) {
			const reasons = conversion.discardedTracks.map((t) => t.reason).join(', ');
			throw new Error(`This file cannot be processed.${reasons ? ` (${reasons})` : ''}`);
		}

		conversion.onProgress = (progress) => {
			post({ type: 'progress', progress: Math.round(progress * 100), stage: 'encoding' });
		};

		const onAbort = () => void conversion.cancel();
		signal.addEventListener('abort', onAbort, { once: true });
		try {
			await conversion.execute();
		} finally {
			signal.removeEventListener('abort', onAbort);
		}

		syncAccessHandle.flush();
		const newBytes = syncAccessHandle.getSize();
		if (newBytes === 0) throw new Error('Conversion produced no output.');
		closeHandleOnce();

		const outputFile = await tempFileHandle.getFile();
		const blob = new Blob([outputFile], { type: 'video/mp4' });

		post({
			type: 'done',
			blob,
			fileName: outputName(file.name, style),
			originalBytes: file.size,
			newBytes,
			width: srcWidth,
			height: srcHeight,
			style
		});

		// Deliberately keep the backing OPFS file around on success -- the
		// Blob just posted is what the download link (and result preview)
		// use, and it can be read much later, or not at all if the user
		// never clicks download. Deleting it immediately here was breaking
		// downloads outright. It gets swept up the next time a run starts
		// (see above), which is the earliest point it's provably no longer
		// needed.
		lastSuccessfulTempFileName = tempFileName;
	} catch (error) {
		closeHandleOnce();
		await opfsRoot.removeEntry(tempFileName).catch(() => {
			/* best-effort cleanup -- a leftover scratch file isn't worth failing over */
		});
		throw error;
	} finally {
		closeHandleOnce();
	}
}

function signalWasAborted(error: unknown): boolean {
	if (error instanceof ConversionCanceledError) return true;
	if (error instanceof DOMException && error.name === 'AbortError') return true;
	return false;
}

self.onmessage = (event: MessageEvent<VhsRequest | CancelRequest>) => {
	const data = event.data;

	if (data.type === 'cancel') {
		abortController?.abort();
		abortController = null;
		return;
	}

	if (data.type !== 'process') return;

	runVhsEffect(data).catch((error: unknown) => {
		if (signalWasAborted(error) || currentSignal?.aborted) return;
		console.error('[videofilter.worker] processing failed:', error);
		post({ type: 'error', message: error instanceof Error ? error.message : 'VHS processing failed' });
	});
};

export {};

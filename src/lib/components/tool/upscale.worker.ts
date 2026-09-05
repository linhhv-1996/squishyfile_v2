/// <reference lib="webworker" />

/**
 * Video-upscale orchestrator. Runs off the main thread, same shape as
 * compress.worker.ts / video2mp3.worker.ts: it owns the whole pipeline and
 * only talks back to the UI through typed postMessage events.
 *
 * Routing (see $lib/upscale/plan.ts for the rule): the source video's height
 * decides which of two very different upscaling engines runs --
 *
 *   - height <= 720p -> AI path: an IMDN_RTE super-resolution model run
 *     through onnxruntime-web (WebGPU when available, WASM/CPU fallback
 *     otherwise). Slower, but noticeably sharper on lower-resolution
 *     sources, which is where AI upscaling earns its cost.
 *   - height  > 720p -> FSR path: AMD FidelityFX Super Resolution 1.0
 *     (EASU + RCAS compute shaders) run directly on the GPU. Much cheaper
 *     per frame than a neural net, which matters a lot once there are
 *     multiple times as many pixels to push, and FSR's spatial upscaling
 *     already looks good on sources that aren't short on detail to begin
 *     with.
 *
 * Both engines are adapted from sample_code/imdn-worker.ts and
 * sample_code/upscale-worker.ts (FSR), merged into one worker and wired to
 * this app's message-protocol conventions instead of sample_code's
 * (type: 'progress' | 'done' | 'error', not 'PROGRESS' / 'DONE' / 'ERROR' /
 * 'LOG').
 *
 * x4 on the AI path: there is no dedicated IMDN x4 model file in
 * static/ai_models (only imdn_rte_x2.onnx, which is architecturally fixed at
 * 2x -- see NATIVE_SCALE below). Per sample_code/imdn-worker.ts's own
 * processFrame(), x4 is produced by cascading the x2 model twice (upscale
 * 2x, then feed that result back through the same model for another 2x),
 * not by using the unrelated Real-ESRGAN-General-x4v3.onnx model that also
 * ships in static/ai_models (that model belongs to a different tool's
 * pipeline -- a different architecture (SRVGGNetCompact/ESRGAN, per
 * sample_code/ai-upscale-worker.ts's comments) with its own tiling scheme,
 * not a drop-in replacement here). Cascading is slower than a native x4
 * model but requires no extra asset and matches the reference behavior
 * exactly, so that's what this worker does.
 */
import { env, InferenceSession, Tensor } from 'onnxruntime-web/webgpu';
import { setupWasmCache, beginOrtDownloadTracking, endOrtDownloadTracking } from './ort-wasm-cache';
import { FSR_EASU_WGSL, FSR_RCAS_WGSL } from '$lib/upscale/fsr-shaders';
import { planForSource, type UpscaleEngine, type UpscaleScale } from '$lib/upscale/plan';
import {
	Input,
	Output,
	Conversion,
	BlobSource,
	BufferTarget,
	Mp4OutputFormat,
	ALL_FORMATS,
	Quality,
	VideoSample,
	ConversionCanceledError
} from 'mediabunny';

setupWasmCache();
env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/';

// ===================================================================================
// Public message protocol (mirrors compress.worker.ts / video2mp3.worker.ts)
// ===================================================================================

export type UpscaleRequest = {
	type: 'upscale';
	file: File;
	scale: UpscaleScale;
};

export type CancelRequest = { type: 'cancel' };

export type UpscaleProgressMessage = {
	type: 'progress';
	/** 0-100 */
	progress: number;
	// 'loading-engine' covers the real, byte-measured download (model file,
	// then the ORT wasm binary on the AI path); 'initializing-engine' covers
	// the compile/instantiate work that follows once every byte is in and
	// there is nothing left to measure -- see the comment on loadImdnModel's
	// `onInitializing` param for why that's a separate stage rather than
	// just leaving progress sitting at 100 under the same label.
	stage: 'probing' | 'loading-engine' | 'initializing-engine' | 'encoding';
	engine: UpscaleEngine | null;
};

export type UpscaleDoneMessage = {
	type: 'done';
	blob: Blob;
	fileName: string;
	originalBytes: number;
	newBytes: number;
	srcWidth: number;
	srcHeight: number;
	outWidth: number;
	outHeight: number;
	scale: UpscaleScale;
	engine: UpscaleEngine;
};

export type UpscaleErrorMessage = { type: 'error'; message: string };

export type WorkerOutMessage = UpscaleProgressMessage | UpscaleDoneMessage | UpscaleErrorMessage;

function post(message: WorkerOutMessage) {
	self.postMessage(message);
}

// ===================================================================================
// Shared helpers
// ===================================================================================

function getFrameSize(source: CanvasImageSource): { width: number; height: number } {
	if ('displayWidth' in source) {
		return { width: (source as VideoFrame).displayWidth, height: (source as VideoFrame).displayHeight };
	}
	return { width: source.width as number, height: source.height as number };
}

function outputName(original: string, scale: UpscaleScale): string {
	const base = original.replace(/\.[^.]+$/, '') || 'video';
	return `${base}-upscaled-${scale}x.mp4`;
}

// ===================================================================================
// AI (IMDN_RTE) engine -- adapted from sample_code/imdn-worker.ts.
// The model is architecturally fixed at a native 2x scale; 4x is produced by
// running two passes back to back (see the module doc comment above).
// ===================================================================================

const IMDN_MODEL_PATH = '/ai_models/imdn_rte_x2.onnx';
const IMDN_NATIVE_SCALE = 2;

/** Versioned so a model-file change doesn't serve a stale cached copy forever. */
const IMDN_MODEL_CACHE_NAME = 'squishyfile-imdn-model-v1';

/**
 * Fetch the IMDN model, serving it from the Cache API when we've seen it
 * before, and reporting byte-level download progress along the way.
 *
 * `onProgress` gets a 0-1 fraction computed ONLY from real bytes over the
 * real Content-Length the server sent -- no guessed/hardcoded file size
 * standing in for a missing header. A made-up total is worse than no
 * progress at all: if the guess undershoots the real size, `received` blows
 * past it and the bar gets stuck under 100% for however long is left after
 * the fake total was "reached", which looks exactly as broken as it is. So
 * when Content-Length is absent, this simply doesn't call `onProgress`
 * during the download (the bar holds at whatever real value it last had)
 * and reports the real, honest 1 only once the transfer has actually
 * finished -- never a number we can't back with bytes the network reported.
 *
 * The cache-write ordering mirrors loadCoreAsset() in `$lib/compress/ffmpeg.ts`
 * -- same bug it was written to avoid applies here: building the cache
 * entry from a response.clone() taken *before* consuming the body would let
 * cache.put() silently drain the whole file into the tee's internal buffer
 * while this function's own progress-tracked loop hadn't pulled a single
 * byte yet, so onProgress would only ever fire once the download was
 * already finished. Instead we read the network stream ourselves first,
 * track progress as bytes actually arrive, and only populate the cache from
 * the in-memory result afterwards -- so there is only ever one reader of
 * the real stream.
 */
async function fetchImdnModel(onProgress: (fraction: number) => void): Promise<ArrayBuffer> {
	const cache = await caches.open(IMDN_MODEL_CACHE_NAME).catch(() => null);
	const hit = await cache?.match(IMDN_MODEL_PATH).catch(() => undefined);

	if (hit) {
		onProgress(1);
		return hit.arrayBuffer();
	}

	const response = await fetch(IMDN_MODEL_PATH);
	if (!response.ok) {
		throw new Error(`Could not download upscaler model (${response.status})`);
	}

	// Real byte count from the server, or 0 meaning "unknown" -- never a
	// stand-in guess. See the function doc above for why.
	const total = Number(response.headers.get('content-length')) || 0;
	const reader = response.body?.getReader();

	let buffer: ArrayBuffer;
	if (!reader) {
		buffer = await response.arrayBuffer();
	} else {
		const chunks: Uint8Array[] = [];
		let received = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
			received += value.length;
			if (total > 0) onProgress(received / total);
		}
		const blob = new Blob(chunks as BlobPart[]);
		buffer = await blob.arrayBuffer();
	}
	onProgress(1);

	if (cache) {
		cache
			.put(IMDN_MODEL_PATH, new Response(buffer.slice(0), { headers: { 'Content-Type': 'application/octet-stream' } }))
			.catch(() => {
				// Storage quota errors etc. are non-fatal -- just means no caching this time.
			});
	}

	return buffer;
}

let imdnSession: InferenceSession | null = null;
let imdnActiveProvider: 'webgpu' | 'wasm' | null = null;

/**
 * "Loading the AI engine" is really three things back to back, only two of
 * which are actual downloads with bytes to count:
 *
 *   1. our own ~394 KB model file (fetchImdnModel above)
 *   2. onnxruntime-web's own wasm binary (several MB, pulled from jsdelivr
 *      the first time InferenceSession.create() runs -- see
 *      ort-wasm-cache.ts)
 *   3. InferenceSession.create() actually instantiating that wasm module
 *      and (on the WebGPU path) compiling shaders/building the graph --
 *      real work, but not a download, so there is no further byte count to
 *      report once step 2's bytes are all in.
 *
 * Reporting a download percentage through step 3 would mean inventing a
 * number with nothing behind it -- exactly the kind of fake progress this
 * file used to do and shouldn't. Instead, `onDownloadProgress` only ever
 * carries real bytes-over-real-total for steps 1-2 (weighted so the caller
 * sees one number moving 0->100 across both real downloads, model first
 * since it's tiny and finishes almost immediately), and `onInitializing`
 * fires exactly once, the moment step 2's real download hits 100%, so the
 * caller can swap to a distinct "now compiling, no percentage to show"
 * label instead of leaving a stale 100% sitting there looking stuck.
 */
const MODEL_DOWNLOAD_WEIGHT = 0.15;

async function loadImdnModel(
	onDownloadProgress: (fraction: number) => void = () => {},
	onInitializing: () => void = () => {}
): Promise<InferenceSession> {
	if (imdnSession) return imdnSession;

	if (navigator.gpu) {
		try {
			const adapter = await navigator.gpu.requestAdapter();
			const requiredLimits: Record<string, number> = {};
			if (adapter?.limits.maxStorageBufferBindingSize) {
				requiredLimits.maxStorageBufferBindingSize = adapter.limits.maxStorageBufferBindingSize;
			}
			if (adapter?.limits.maxBufferSize) {
				requiredLimits.maxBufferSize = adapter.limits.maxBufferSize;
			}
			const requiredFeatures: GPUFeatureName[] = [];
			if (adapter?.features.has('shader-f16')) requiredFeatures.push('shader-f16');
			const device = await adapter?.requestDevice({ requiredLimits, requiredFeatures });
			if (device) {
				(env as any).webgpu = (env as any).webgpu || {};
				(env as any).webgpu.device = device;
			}
		} catch (err) {
			console.warn('[upscale.worker] WebGPU device init failed for IMDN, will try WASM:', err);
		}
	}

	const modelBuffer = await fetchImdnModel((fraction) =>
		onDownloadProgress(fraction * MODEL_DOWNLOAD_WEIGHT)
	);

	let announcedInitializing = false;
	beginOrtDownloadTracking((fraction) => {
		onDownloadProgress(MODEL_DOWNLOAD_WEIGHT + fraction * (1 - MODEL_DOWNLOAD_WEIGHT));
		// The .wasm binary is the only file this tracks (see ort-wasm-cache.ts),
		// so fraction reaching 1 means every byte of it is actually in --
		// the earliest honest moment to say "downloading is over, now
		// initializing" rather than continuing to imply there's more to fetch.
		if (fraction >= 1 && !announcedInitializing) {
			announcedInitializing = true;
			onInitializing();
		}
	});
	try {
		try {
			imdnSession = await InferenceSession.create(new Uint8Array(modelBuffer), {
				executionProviders: [{ name: 'webgpu', preferredLayout: 'NCHW' }]
			});
			imdnActiveProvider = 'webgpu';
		} catch {
			imdnSession = await InferenceSession.create(new Uint8Array(modelBuffer), {
				executionProviders: ['wasm']
			});
			imdnActiveProvider = 'wasm';
		}
	} finally {
		endOrtDownloadTracking();
	}
	// Covers the case where the wasm binary was already cached (no network
	// read-loop ever ran, so the fraction>=1 branch above never fired) --
	// downloading is just as "over" here, immediately, so still announce it
	// rather than leaving the caller on whatever stage it was in before.
	if (!announcedInitializing) onInitializing();

	return imdnSession;
}

/**
 * Runtime WebGPU failure fallback -- session creation can succeed on WebGPU
 * while a specific kernel still fails to compile lazily on the first
 * sess.run() (seen on some WebGPU/Metal backends). Rebuild on WASM and retry.
 */
async function fallbackImdnToWasm(): Promise<InferenceSession> {
	try {
		await imdnSession?.release();
	} catch {
		// Ignore -- we're replacing this session anyway.
	}
	const modelBuffer = await fetchImdnModel(() => {});
	imdnSession = await InferenceSession.create(new Uint8Array(modelBuffer), {
		executionProviders: ['wasm']
	});
	imdnActiveProvider = 'wasm';
	return imdnSession;
}

async function runImdnInference(sess: InferenceSession, inputTensor: Tensor) {
	try {
		return await sess.run({ [sess.inputNames[0]]: inputTensor });
	} catch (err) {
		if (imdnSession && imdnSession !== sess) {
			return await imdnSession.run({ [imdnSession.inputNames[0]]: inputTensor });
		}
		if (imdnActiveProvider === 'wasm') throw err;
		console.error('[upscale.worker] IMDN WebGPU inference failed, falling back to WASM:', err);
		const wasmSess = await fallbackImdnToWasm();
		return await wasmSess.run({ [wasmSess.inputNames[0]]: inputTensor });
	}
}

let imdnFloatData = new Float32Array(0);
let imdnOutBuffer = new Uint8ClampedArray(0);
let imdnInCanvas: OffscreenCanvas | null = null;
let imdnInCtx: OffscreenCanvasRenderingContext2D | null = null;
let imdnOutCanvas: OffscreenCanvas | null = null;
let imdnOutCtx: OffscreenCanvasRenderingContext2D | null = null;

/** One 2x IMDN pass. Marshaling happens on CPU -- ORT's WebGPU EP still runs
 * the actual inference on GPU internally; it handles CPU->GPU transfer on
 * its own, so a hand-rolled GPU pack/unpack path (see sample_code) buys
 * nothing here and risks NCHW/NHWC layout mismatches. */
async function imdnPass(
	sess: InferenceSession,
	source: CanvasImageSource,
	srcW: number,
	srcH: number
): Promise<OffscreenCanvas> {
	const padW = Math.ceil(srcW / 16) * 16;
	const padH = Math.ceil(srcH / 16) * 16;
	const outW = padW * IMDN_NATIVE_SCALE;
	const outH = padH * IMDN_NATIVE_SCALE;

	if (!imdnInCanvas || imdnInCanvas.width !== padW || imdnInCanvas.height !== padH) {
		imdnInCanvas = new OffscreenCanvas(padW, padH);
		imdnInCtx = imdnInCanvas.getContext('2d', { willReadFrequently: true })!;
	}
	imdnInCtx!.clearRect(0, 0, padW, padH);
	imdnInCtx!.drawImage(source, 0, 0);

	const fullIn = imdnInCtx!.getImageData(0, 0, padW, padH);
	const inData = fullIn.data;
	const len = padW * padH;
	if (imdnFloatData.length !== 3 * len) imdnFloatData = new Float32Array(3 * len);

	// Edge-replicate padding out to the tile-aligned size.
	for (let ry = 0; ry < padH; ry++) {
		const cy = Math.min(ry, srcH - 1);
		for (let rx = 0; rx < padW; rx++) {
			const cx = Math.min(rx, srcW - 1);
			const si = (cy * padW + cx) * 4;
			const di = ry * padW + rx;
			imdnFloatData[di] = inData[si];
			imdnFloatData[len + di] = inData[si + 1];
			imdnFloatData[2 * len + di] = inData[si + 2];
		}
	}

	const inputTensor = new Tensor('float32', imdnFloatData, [1, 3, padH, padW]);
	const results = await runImdnInference(sess, inputTensor);
	const outFloatData = results[sess.outputNames[0]].data as Float32Array;

	const outLen = outW * outH;
	const outBufLen = outLen * 4;
	if (imdnOutBuffer.length !== outBufLen) imdnOutBuffer = new Uint8ClampedArray(outBufLen);

	for (let ry = 0; ry < outH; ry++) {
		const dstRowStart = ry * outW * 4;
		const srcRowStart = ry * outW;
		for (let rx = 0; rx < outW; rx++) {
			const d = dstRowStart + rx * 4;
			const si = srcRowStart + rx;
			imdnOutBuffer[d] = outFloatData[si];
			imdnOutBuffer[d + 1] = outFloatData[outLen + si];
			imdnOutBuffer[d + 2] = outFloatData[2 * outLen + si];
			imdnOutBuffer[d + 3] = 255;
		}
	}

	if (!imdnOutCanvas || imdnOutCanvas.width !== outW || imdnOutCanvas.height !== outH) {
		imdnOutCanvas = new OffscreenCanvas(outW, outH);
		imdnOutCtx = imdnOutCanvas.getContext('2d')!;
	}
	imdnOutCtx!.putImageData(new ImageData(imdnOutBuffer, outW, outH), 0, 0);

	return imdnOutCanvas;
}

let imdnFinalCanvas: OffscreenCanvas | null = null;
let imdnFinalCtx: OffscreenCanvasRenderingContext2D | null = null;
let imdnPerfFrames = 0;
let imdnPerfTotalMs = 0;

/** Orchestrates 1 pass (2x) or 2 cascaded passes (4x) of the IMDN model. */
async function imdnUpscale(sample: VideoSample, scale: UpscaleScale): Promise<OffscreenCanvas> {
	const t0 = performance.now();
	const sess = await loadImdnModel();

	const source = sample.toCanvasImageSource();
	const { width, height } = getFrameSize(source);

	const pass1 = await imdnPass(sess, source, width, height);
	let resultCanvas = pass1;
	let actualW = width * IMDN_NATIVE_SCALE;
	let actualH = height * IMDN_NATIVE_SCALE;

	if (scale === 4) {
		const bitmap = await createImageBitmap(pass1, 0, 0, actualW, actualH);
		resultCanvas = await imdnPass(sess, bitmap, actualW, actualH);
		bitmap.close();
		actualW *= IMDN_NATIVE_SCALE;
		actualH *= IMDN_NATIVE_SCALE;
	}

	// Crop off tile-alignment padding and land on the exact target size.
	const finalW = width * scale;
	const finalH = height * scale;
	if (!imdnFinalCanvas || imdnFinalCanvas.width !== finalW || imdnFinalCanvas.height !== finalH) {
		imdnFinalCanvas = new OffscreenCanvas(finalW, finalH);
		imdnFinalCtx = imdnFinalCanvas.getContext('2d')!;
	}
	imdnFinalCtx!.drawImage(resultCanvas, 0, 0, actualW, actualH, 0, 0, finalW, finalH);

	imdnPerfFrames++;
	imdnPerfTotalMs += performance.now() - t0;
	if (imdnPerfFrames === 1 || imdnPerfFrames % 15 === 0) {
		console.log(
			`[upscale.worker/ai/${imdnActiveProvider}] frame ${imdnPerfFrames}: avg ${(imdnPerfTotalMs / imdnPerfFrames).toFixed(1)}ms/frame`
		);
	}

	return imdnFinalCanvas;
}

// ===================================================================================
// FSR engine -- adapted from sample_code/upscale-worker.ts + fsr-shaders.ts.
// ===================================================================================

interface FsrGpuPipeline {
	device: GPUDevice;
	easuPipeline: GPUComputePipeline;
	rcasPipeline: GPUComputePipeline;
	sampler: GPUSampler;
}

let fsrGpu: FsrGpuPipeline | null = null;
let fsrGpuInitPromise: Promise<FsrGpuPipeline | null> | null = null;

let fsrSrcTexture: GPUTexture | null = null;
let fsrEasuTexture: GPUTexture | null = null;
let fsrRcasTexture: GPUTexture | null = null;
let fsrStagingBuffer: GPUBuffer | null = null;
let fsrResolutionBuffer: GPUBuffer | null = null;
let fsrEasuBindGroup0: GPUBindGroup | null = null;
let fsrEasuBindGroup1: GPUBindGroup | null = null;
let fsrRcasBindGroup0: GPUBindGroup | null = null;
let fsrRcasBindGroup1: GPUBindGroup | null = null;
let fsrSizeKey = '';

let fsrFinalCanvas: OffscreenCanvas | null = null;
let fsrFinalCtx: OffscreenCanvasRenderingContext2D | null = null;
let fsrPerfFrames = 0;
let fsrPerfTotalMs = 0;
let fsrActiveProvider: 'webgpu' | 'canvas2d' | null = null;

async function ensureFsrPipeline(): Promise<FsrGpuPipeline | null> {
	if (fsrGpu) return fsrGpu;
	if (fsrGpuInitPromise) return fsrGpuInitPromise;

	fsrGpuInitPromise = (async () => {
		if (!navigator.gpu) return null;
		try {
			const adapter = await navigator.gpu.requestAdapter();
			if (!adapter) return null;

			const requiredLimits: Record<string, number> = {};
			if (adapter.limits.maxStorageBufferBindingSize) {
				requiredLimits.maxStorageBufferBindingSize = adapter.limits.maxStorageBufferBindingSize;
			}
			if (adapter.limits.maxBufferSize) {
				requiredLimits.maxBufferSize = adapter.limits.maxBufferSize;
			}

			const device = await adapter.requestDevice({ requiredLimits });

			const easuModule = device.createShaderModule({ code: FSR_EASU_WGSL });
			const rcasModule = device.createShaderModule({ code: FSR_RCAS_WGSL });
			const [easuPipeline, rcasPipeline] = await Promise.all([
				device.createComputePipelineAsync({ layout: 'auto', compute: { module: easuModule, entryPoint: 'main' } }),
				device.createComputePipelineAsync({ layout: 'auto', compute: { module: rcasModule, entryPoint: 'main' } })
			]);

			const sampler = device.createSampler({
				magFilter: 'linear',
				minFilter: 'linear',
				addressModeU: 'clamp-to-edge',
				addressModeV: 'clamp-to-edge'
			});

			return { device, easuPipeline, rcasPipeline, sampler };
		} catch (err) {
			console.warn('[upscale.worker] WebGPU init failed for FSR, falling back to Canvas 2D:', err);
			return null;
		}
	})();

	fsrGpu = await fsrGpuInitPromise;
	return fsrGpu;
}

function ensureFsrSizeResources(g: FsrGpuPipeline, srcW: number, srcH: number, outW: number, outH: number) {
	const key = `${srcW}x${srcH}->${outW}x${outH}`;
	if (fsrSizeKey === key && fsrSrcTexture && fsrEasuTexture && fsrRcasTexture && fsrStagingBuffer) return;
	fsrSizeKey = key;

	const textureUsage = (globalThis as any).GPUTextureUsage;
	const bufferUsage = (globalThis as any).GPUBufferUsage;

	fsrSrcTexture?.destroy();
	fsrSrcTexture = g.device.createTexture({
		size: [srcW, srcH],
		format: 'rgba8unorm',
		usage: textureUsage.TEXTURE_BINDING | textureUsage.COPY_DST | textureUsage.RENDER_ATTACHMENT
	});

	fsrEasuTexture?.destroy();
	fsrEasuTexture = g.device.createTexture({
		size: [outW, outH],
		format: 'rgba8unorm',
		usage: textureUsage.STORAGE_BINDING | textureUsage.TEXTURE_BINDING
	});

	fsrRcasTexture?.destroy();
	fsrRcasTexture = g.device.createTexture({
		size: [outW, outH],
		format: 'rgba8unorm',
		usage: textureUsage.STORAGE_BINDING | textureUsage.COPY_SRC
	});

	const bytesPerRow = Math.ceil((outW * 4) / 256) * 256;
	fsrStagingBuffer?.destroy();
	fsrStagingBuffer = g.device.createBuffer({
		size: bytesPerRow * outH,
		usage: bufferUsage.COPY_DST | bufferUsage.MAP_READ
	});

	fsrResolutionBuffer?.destroy();
	fsrResolutionBuffer = g.device.createBuffer({ size: 16, usage: bufferUsage.UNIFORM | bufferUsage.COPY_DST });
	g.device.queue.writeBuffer(fsrResolutionBuffer, 0, new Float32Array([srcW, srcH, outW, outH]));

	fsrEasuBindGroup0 = g.device.createBindGroup({
		layout: g.easuPipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: fsrSrcTexture.createView() },
			{ binding: 1, resource: g.sampler },
			{ binding: 2, resource: fsrEasuTexture.createView() }
		]
	});
	fsrEasuBindGroup1 = g.device.createBindGroup({
		layout: g.easuPipeline.getBindGroupLayout(1),
		entries: [{ binding: 0, resource: { buffer: fsrResolutionBuffer } }]
	});
	fsrRcasBindGroup0 = g.device.createBindGroup({
		layout: g.rcasPipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: fsrEasuTexture.createView() },
			{ binding: 1, resource: fsrRcasTexture.createView() }
		]
	});
	fsrRcasBindGroup1 = g.device.createBindGroup({
		layout: g.rcasPipeline.getBindGroupLayout(1),
		entries: [{ binding: 0, resource: { buffer: fsrResolutionBuffer } }]
	});
}

async function fsrUpscale(
	source: CanvasImageSource,
	srcW: number,
	srcH: number,
	scale: UpscaleScale
): Promise<OffscreenCanvas> {
	const t0 = performance.now();
	const outW = srcW * scale;
	const outH = srcH * scale;

	if (!fsrFinalCanvas || fsrFinalCanvas.width !== outW || fsrFinalCanvas.height !== outH) {
		fsrFinalCanvas = new OffscreenCanvas(outW, outH);
		fsrFinalCtx = fsrFinalCanvas.getContext('2d')!;
	}

	const g = await ensureFsrPipeline();

	if (g) {
		fsrActiveProvider = 'webgpu';
		ensureFsrSizeResources(g, srcW, srcH, outW, outH);

		g.device.queue.copyExternalImageToTexture({ source: source as any }, { texture: fsrSrcTexture! }, [srcW, srcH]);

		const encoder = g.device.createCommandEncoder();

		const easuPass = encoder.beginComputePass();
		easuPass.setPipeline(g.easuPipeline);
		easuPass.setBindGroup(0, fsrEasuBindGroup0!);
		easuPass.setBindGroup(1, fsrEasuBindGroup1!);
		easuPass.dispatchWorkgroups(Math.ceil(outW / 8), Math.ceil(outH / 8));
		easuPass.end();

		const rcasPass = encoder.beginComputePass();
		rcasPass.setPipeline(g.rcasPipeline);
		rcasPass.setBindGroup(0, fsrRcasBindGroup0!);
		rcasPass.setBindGroup(1, fsrRcasBindGroup1!);
		rcasPass.dispatchWorkgroups(Math.ceil(outW / 8), Math.ceil(outH / 8));
		rcasPass.end();

		const bytesPerRow = Math.ceil((outW * 4) / 256) * 256;
		encoder.copyTextureToBuffer({ texture: fsrRcasTexture! }, { buffer: fsrStagingBuffer!, bytesPerRow }, [outW, outH]);
		g.device.queue.submit([encoder.finish()]);

		await fsrStagingBuffer!.mapAsync((globalThis as any).GPUMapMode.READ);
		const arrayBuffer = fsrStagingBuffer!.getMappedRange();

		let finalBytes: Uint8ClampedArray;
		if (bytesPerRow === outW * 4) {
			finalBytes = new Uint8ClampedArray(arrayBuffer.slice(0));
		} else {
			// WebGPU's copyTextureToBuffer requires bytesPerRow to be a multiple
			// of 256 -- repack row by row when the real width doesn't divide evenly.
			finalBytes = new Uint8ClampedArray(outW * outH * 4);
			const view = new Uint8Array(arrayBuffer);
			for (let y = 0; y < outH; y++) {
				const srcStart = y * bytesPerRow;
				const dstStart = y * outW * 4;
				finalBytes.set(view.subarray(srcStart, srcStart + outW * 4), dstStart);
			}
		}
		fsrStagingBuffer!.unmap();

		fsrFinalCtx!.putImageData(new ImageData(finalBytes as any, outW, outH), 0, 0);
	} else {
		// No WebGPU (or init failed) -- fall back to a plain bilinear scale so
		// the tool still produces *something* rather than failing outright.
		fsrActiveProvider = 'canvas2d';
		fsrFinalCtx!.imageSmoothingEnabled = true;
		fsrFinalCtx!.imageSmoothingQuality = 'high';
		fsrFinalCtx!.clearRect(0, 0, outW, outH);
		fsrFinalCtx!.drawImage(source, 0, 0, outW, outH);
	}

	fsrPerfFrames++;
	fsrPerfTotalMs += performance.now() - t0;
	if (fsrPerfFrames === 1 || fsrPerfFrames % 30 === 0) {
		console.log(
			`[upscale.worker/fsr/${fsrActiveProvider}] frame ${fsrPerfFrames}: avg ${(fsrPerfTotalMs / fsrPerfFrames).toFixed(1)}ms/frame`
		);
	}

	return fsrFinalCanvas;
}

// ===================================================================================
// Orchestration: probe -> route -> convert
// ===================================================================================

let abortController: AbortController | null = null;
let currentSignal: AbortSignal | null = null;

async function upscale(request: UpscaleRequest) {
	const { file, scale } = request;

	abortController?.abort();
	abortController = new AbortController();
	const { signal } = abortController;
	currentSignal = signal;

	post({ type: 'progress', progress: 0, stage: 'probing', engine: null });

	const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
	const primaryVideoTrack = await input.getPrimaryVideoTrack();
	if (!primaryVideoTrack) throw new Error('No video track found in file.');

	const srcWidth = await primaryVideoTrack.getDisplayWidth();
	const srcHeight = await primaryVideoTrack.getDisplayHeight();

	const plan = planForSource({ height: srcHeight }, scale);

	post({ type: 'progress', progress: 0, stage: 'loading-engine', engine: plan.engine });

	// Warm up the chosen engine (model load / shader compile) before handing
	// frames to Conversion, so the loading-engine -> encoding stage change in
	// the UI actually lines up with real work instead of happening instantly.
	if (plan.engine === 'ai') {
		await loadImdnModel(
			(fraction) => {
				post({
					type: 'progress',
					progress: Math.round(fraction * 100),
					stage: 'loading-engine',
					engine: plan.engine
				});
			},
			() => {
				// Downloading is done; InferenceSession.create() is still busy
				// instantiating/compiling with no further bytes to report --
				// say so explicitly instead of leaving the UI on a 100% that
				// looks finished when it isn't.
				post({ type: 'progress', progress: 100, stage: 'initializing-engine', engine: plan.engine });
			}
		);
	} else {
		await ensureFsrPipeline();
	}

	const bufferTarget = new BufferTarget();
	const output = new Output({ format: new Mp4OutputFormat(), target: bufferTarget });

	const conversion = await Conversion.init({
		input,
		output,
		video: {
			codec: 'avc',
			// Bake rotation into the pixels ourselves instead of letting Mediabunny
			// re-tag the output with the input's rotation metadata: our process()
			// callback already sizes/draws frames using *display* (post-rotation)
			// dimensions (getDisplayWidth/getDisplayHeight, getFrameSize), so the
			// canvases we return are already correctly oriented. Mediabunny's
			// process() docs say "rotation metadata of the returned sample will be
			// ignored", but allowRotationMetadata defaults to true, meaning it can
			// still stamp the *input* track's own rotation matrix onto the output
			// container -- on a portrait phone clip that doubles the rotation on
			// playback (once baked in by us, once again via container metadata),
			// which is exactly what made before/after look mismatched in height.
			allowRotationMetadata: false,
			quality: new Quality('high'),
			process: async (sample: VideoSample) => {
				if (plan.engine === 'ai') {
					return await imdnUpscale(sample, plan.scale);
				}
				const source = sample.toCanvasImageSource();
				const { width, height } = getFrameSize(source);
				return await fsrUpscale(source, width, height, plan.scale);
			},
			processedWidth: srcWidth * plan.scale,
			processedHeight: srcHeight * plan.scale
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
		post({ type: 'progress', progress: Math.round(progress * 100), stage: 'encoding', engine: plan.engine });
	};

	const onAbort = () => void conversion.cancel();
	signal.addEventListener('abort', onAbort, { once: true });
	try {
		await conversion.execute();
	} finally {
		signal.removeEventListener('abort', onAbort);
	}

	if (!bufferTarget.buffer) throw new Error('Conversion produced no output.');
	const blob = new Blob([bufferTarget.buffer], { type: 'video/mp4' });

	post({
		type: 'done',
		blob,
		fileName: outputName(file.name, scale),
		originalBytes: file.size,
		newBytes: blob.size,
		srcWidth,
		srcHeight,
		outWidth: srcWidth * scale,
		outHeight: srcHeight * scale,
		scale,
		engine: plan.engine
	});
}

function signalWasAborted(error: unknown): boolean {
	if (error instanceof ConversionCanceledError) return true;
	if (error instanceof DOMException && error.name === 'AbortError') return true;
	return false;
}

self.onmessage = (event: MessageEvent<UpscaleRequest | CancelRequest>) => {
	const data = event.data;

	if (data.type === 'cancel') {
		abortController?.abort();
		abortController = null;
		return;
	}

	if (data.type !== 'upscale') return;

	upscale(data).catch((error: unknown) => {
		if (signalWasAborted(error) || currentSignal?.aborted) return;
		console.error('[upscale.worker] upscale failed:', error);
		post({ type: 'error', message: error instanceof Error ? error.message : 'Upscaling failed' });
	});
};

export {};

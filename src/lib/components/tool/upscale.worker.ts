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
import { setupWasmCache } from './ort-wasm-cache';
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
	stage: 'probing' | 'loading-engine' | 'encoding';
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

let imdnSession: InferenceSession | null = null;
let imdnActiveProvider: 'webgpu' | 'wasm' | null = null;

async function loadImdnModel(): Promise<InferenceSession> {
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

	try {
		imdnSession = await InferenceSession.create(IMDN_MODEL_PATH, {
			executionProviders: [{ name: 'webgpu', preferredLayout: 'NCHW' }]
		});
		imdnActiveProvider = 'webgpu';
	} catch {
		imdnSession = await InferenceSession.create(IMDN_MODEL_PATH, { executionProviders: ['wasm'] });
		imdnActiveProvider = 'wasm';
	}

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
	imdnSession = await InferenceSession.create(IMDN_MODEL_PATH, { executionProviders: ['wasm'] });
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
		await loadImdnModel();
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

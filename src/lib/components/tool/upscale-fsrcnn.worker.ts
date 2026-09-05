/// <reference lib="webworker" />

/**
 * Video-upscale orchestrator -- FSRCNN variant, for testing.
 *
 * Structural twin of upscale.worker.ts (same message protocol, same
 * probe -> route -> convert orchestration, same FSR path for sources above
 * 720p) but with the AI path swapped from IMDN_RTE to FSRCNN. Adapted from
 * sample_code/fsrcnn-worker.ts, which is the reference implementation for
 * how FSRCNN actually has to be run:
 *
 *   - FSRCNN's ONNX graph outputs a single-channel (Y/luminance) plane, not
 *     RGB like IMDN_RTE. The rest of the color (Cb/Cr chroma) has to come
 *     from the *source* frame and get recombined with the model's new Y
 *     channel via a YCbCr->RGB conversion. sample_code/fsrcnn-worker.ts does
 *     this recombination inside a WebGPU compute shader (UNPACK_WGSL below)
 *     rather than round-tripping through the CPU, and this file keeps that
 *     approach -- it's real work the sample already solved, not something to
 *     redo more simply.
 *   - Unlike IMDN_RTE (fixed at a native 2x, cascaded twice for 4x -- see
 *     upscale.worker.ts's module doc), the model files that ship in
 *     static/ai_models include a native model per scale (fsrcnn_x2.onnx,
 *     fsrcnn_x4.onnx), so there is no cascading here: whichever scale the
 *     user picked loads its own model directly.
 *
 * Message protocol is unchanged from upscale.worker.ts (type: 'progress' |
 * 'done' | 'error', not sample_code's 'LOG'/'PROGRESS'/'DONE'/'ERROR'), so
 * UpscaleVideo.svelte can point at this file instead with only its two
 * `import` lines changed -- see the bottom of this file's comments for swap
 * instructions.
 *
 * Routing (unchanged -- see $lib/upscale/plan.ts): source height <= 720p
 * runs the AI path (now FSRCNN instead of IMDN_RTE); anything taller runs
 * FSR (AMD FidelityFX Super Resolution 1.0), copied over from
 * upscale.worker.ts as-is since none of this affects that path.
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
// Public message protocol (identical shape to upscale.worker.ts)
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
// AI (FSRCNN) engine -- adapted from sample_code/fsrcnn-worker.ts.
//
// FSRCNN ships one native model per scale (fsrcnn_x2.onnx / fsrcnn_x4.onnx),
// so -- unlike the IMDN path in upscale.worker.ts -- there is no cascading:
// whichever scale was requested loads and runs its own model once per frame.
// ===================================================================================

function fsrcnnModelPath(scale: UpscaleScale): string {
	return `/ai_models/fsrcnn_x${scale}.onnx`;
}

/** Versioned so a model-file change doesn't serve a stale cached copy forever. */
const FSRCNN_MODEL_CACHE_NAME = 'squishyfile-fsrcnn-model-v1';

/**
 * Fetch the FSRCNN model for the given scale, serving it from the Cache API
 * when we've seen it before, and reporting byte-level download progress
 * along the way. Same honest-progress contract as fetchImdnModel in
 * upscale.worker.ts: `onProgress` only ever gets a 0-1 fraction backed by
 * real bytes over a real Content-Length -- never a guessed total -- so if
 * the header is missing this simply doesn't report a fraction until the
 * transfer has actually finished.
 */
async function fetchFsrcnnModel(scale: UpscaleScale, onProgress: (fraction: number) => void): Promise<ArrayBuffer> {
	const modelPath = fsrcnnModelPath(scale);
	const cache = await caches.open(FSRCNN_MODEL_CACHE_NAME).catch(() => null);
	const hit = await cache?.match(modelPath).catch(() => undefined);

	if (hit) {
		onProgress(1);
		return hit.arrayBuffer();
	}

	const response = await fetch(modelPath);
	if (!response.ok) {
		throw new Error(`Could not download upscaler model (${response.status})`);
	}

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
			.put(modelPath, new Response(buffer.slice(0), { headers: { 'Content-Type': 'application/octet-stream' } }))
			.catch(() => {
				// Storage quota errors etc. are non-fatal -- just means no caching this time.
			});
	}

	return buffer;
}

/** Keyed by scale -- x2 and x4 are different model files, so a session for
 * one scale can't serve the other. Sessions for scales that weren't picked
 * this run are simply never created. */
const fsrcnnSessions = new Map<UpscaleScale, InferenceSession>();
let fsrcnnActiveProvider: 'webgpu' | 'wasm' | null = null;

const MODEL_DOWNLOAD_WEIGHT = 0.15;

/**
 * Same three-stage "loading the engine" story as loadImdnModel in
 * upscale.worker.ts: our own model file, then onnxruntime-web's wasm binary,
 * then InferenceSession.create() actually instantiating it -- see that
 * function's doc comment for why progress is only ever reported for the
 * first two (real bytes) and the third gets a distinct
 * "initializing, no percentage" signal instead of an invented one.
 */
async function loadFsrcnnModel(
	scale: UpscaleScale,
	onDownloadProgress: (fraction: number) => void = () => {},
	onInitializing: () => void = () => {}
): Promise<InferenceSession> {
	const cached = fsrcnnSessions.get(scale);
	if (cached) return cached;

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
			console.warn('[upscale-fsrcnn.worker] WebGPU device init failed, will try WASM:', err);
		}
	}

	const modelBuffer = await fetchFsrcnnModel(scale, (fraction) =>
		onDownloadProgress(fraction * MODEL_DOWNLOAD_WEIGHT)
	);

	let announcedInitializing = false;
	beginOrtDownloadTracking((fraction) => {
		onDownloadProgress(MODEL_DOWNLOAD_WEIGHT + fraction * (1 - MODEL_DOWNLOAD_WEIGHT));
		if (fraction >= 1 && !announcedInitializing) {
			announcedInitializing = true;
			onInitializing();
		}
	});

	let session: InferenceSession;
	try {
		try {
			session = await InferenceSession.create(new Uint8Array(modelBuffer), {
				executionProviders: [{ name: 'webgpu', preferredLayout: 'NCHW' }]
			});
			fsrcnnActiveProvider = 'webgpu';
		} catch {
			session = await InferenceSession.create(new Uint8Array(modelBuffer), {
				executionProviders: ['wasm']
			});
			fsrcnnActiveProvider = 'wasm';
		}
	} finally {
		endOrtDownloadTracking();
	}
	if (!announcedInitializing) onInitializing();

	fsrcnnSessions.set(scale, session);
	return session;
}

/**
 * Runtime WebGPU failure fallback -- mirrors fallbackImdnToWasm in
 * upscale.worker.ts. Session creation can succeed on WebGPU while a specific
 * kernel still fails to compile lazily on the first sess.run(); rebuild that
 * scale's session on WASM and retry.
 */
async function fallbackFsrcnnToWasm(scale: UpscaleScale): Promise<InferenceSession> {
	try {
		await fsrcnnSessions.get(scale)?.release();
	} catch {
		// Ignore -- we're replacing this session anyway.
	}
	const modelBuffer = await fetchFsrcnnModel(scale, () => {});
	const session = await InferenceSession.create(new Uint8Array(modelBuffer), {
		executionProviders: ['wasm']
	});
	fsrcnnActiveProvider = 'wasm';
	fsrcnnSessions.set(scale, session);
	return session;
}

// ---- WebGPU pack/unpack shaders --------------------------------------------------
// FSRCNN only outputs the Y (luminance) channel. Rather than building a
// bilinear canvas on the CPU and re-uploading it just to read chroma back off
// (the sample's own comment on this: ~100ms/frame), the source frame is
// uploaded to a GPU texture once and both directions -- packing Y in, and
// recombining the model's new Y with the source's Cb/Cr on the way out --
// happen in compute shaders. Copied verbatim from
// sample_code/fsrcnn-worker.ts; this part has nothing project-specific about
// it, it's just how FSRCNN has to be fed and read.

const FSRCNN_PACK_WGSL = /* wgsl */ `
struct PackParams {
  tileX: u32,
  tileY: u32,
  srcW: u32,
  srcH: u32,
  batchSlot: u32,
  padW: u32,
  padH: u32,
  _pad2: u32,
};
@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> outBuf: array<f32>;
@group(0) @binding(2) var<uniform> params: PackParams;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.padW || gid.y >= params.padH) {
    return;
  }
  let sx = params.tileX + gid.x;
  let sy = params.tileY + gid.y;
  var px = vec4<f32>(0.0, 0.0, 0.0, 1.0);
  if (sx < params.srcW && sy < params.srcH) {
    px = textureLoad(srcTex, vec2<i32>(i32(sx), i32(sy)), 0);
  }
  let idx = gid.y * params.padW + gid.x;
  let batchOffset = params.batchSlot * params.padW * params.padH;
  // RGB to Y (BT.601)
  let y = 0.299 * px.r + 0.587 * px.g + 0.114 * px.b;
  outBuf[batchOffset + idx] = y;
}
`;

const FSRCNN_UNPACK_WGSL = /* wgsl */ `
struct UnpackParams {
  dstX: u32,
  dstY: u32,
  dstStride: u32,
  batchSlot: u32,
  outPadW: u32,
  outPadH: u32,
  scale: u32,
  _pad2: u32,
};
@group(0) @binding(0) var<storage, read> modelOut: array<f32>;
@group(0) @binding(1) var srcTex: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> outPacked: array<u32>;
@group(0) @binding(3) var<uniform> params: UnpackParams;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.outPadW || gid.y >= params.outPadH) {
    return;
  }
  let planeLen = params.outPadW * params.outPadH;
  let batchOffset = params.batchSlot * planeLen;
  let si = gid.y * params.outPadW + gid.x;

  // Model provides the high-res Y channel.
  let new_y = modelOut[batchOffset + si];

  // Chroma comes from the source texture (nearest-neighbor lookup).
  let srcX = gid.x / params.scale;
  let srcY = gid.y / params.scale;
  let srcDims = textureDimensions(srcTex);
  let clampedX = min(srcX, srcDims.x - 1u);
  let clampedY = min(srcY, srcDims.y - 1u);
  let px_src = textureLoad(srcTex, vec2<u32>(clampedX, clampedY), 0);

  // RGB->YUV on the source pixel to recover U, V.
  let u = -0.14713 * px_src.r - 0.28886 * px_src.g + 0.436 * px_src.b;
  let v = 0.615 * px_src.r - 0.51499 * px_src.g - 0.10001 * px_src.b;

  // YUV->RGB combining the model's new Y with the source's U/V.
  let r = new_y + 1.13983 * v;
  let g = new_y - 0.39465 * u - 0.58060 * v;
  let b = new_y + 2.03211 * u;

  let packed = pack4x8unorm(vec4<f32>(r, g, b, 1.0));
  let dstIdx = (params.dstY + gid.y) * params.dstStride + (params.dstX + gid.x);
  outPacked[dstIdx] = packed;
}
`;

interface FsrcnnGpuPipeline {
	device: GPUDevice;
	packPipeline: GPUComputePipeline;
	unpackPipeline: GPUComputePipeline;
	packParamsBuffer: GPUBuffer;
	unpackParamsBuffer: GPUBuffer;
}

let fsrcnnGpu: FsrcnnGpuPipeline | null = null;
let fsrcnnGpuInitPromise: Promise<FsrcnnGpuPipeline> | null = null;

let fsrcnnSrcTexture: GPUTexture | null = null;
let fsrcnnInputGpuBuffer: GPUBuffer | null = null;
let fsrcnnPackBindGroup: GPUBindGroup | null = null;
let fsrcnnOutPackedBuffer: GPUBuffer | null = null;
let fsrcnnStagingBuffer: GPUBuffer | null = null;
let fsrcnnSizeKey = '';

let fsrcnnOutCanvas: OffscreenCanvas | null = null;
let fsrcnnOutCtx: OffscreenCanvasRenderingContext2D | null = null;
let fsrcnnFinalCanvas: OffscreenCanvas | null = null;
let fsrcnnFinalCtx: OffscreenCanvasRenderingContext2D | null = null;

// CPU fallback state.
let fsrcnnFloatData = new Float32Array(0);
let fsrcnnCpuOutBuffer = new Uint8ClampedArray(0);
let fsrcnnInCanvas: OffscreenCanvas | null = null;
let fsrcnnInCtx: OffscreenCanvasRenderingContext2D | null = null;
let fsrcnnBilinearCanvas: OffscreenCanvas | null = null;
let fsrcnnBilinearCtx: OffscreenCanvasRenderingContext2D | null = null;

let fsrcnnPerfFrames = 0;
let fsrcnnPerfTotalMs = 0;

async function ensureFsrcnnGpuPipeline(device: GPUDevice): Promise<FsrcnnGpuPipeline> {
	if (fsrcnnGpu) return fsrcnnGpu;
	if (fsrcnnGpuInitPromise) return fsrcnnGpuInitPromise;

	fsrcnnGpuInitPromise = (async () => {
		const packModule = device.createShaderModule({ code: FSRCNN_PACK_WGSL });
		const unpackModule = device.createShaderModule({ code: FSRCNN_UNPACK_WGSL });

		const [packPipeline, unpackPipeline] = await Promise.all([
			device.createComputePipelineAsync({ layout: 'auto', compute: { module: packModule, entryPoint: 'main' } }),
			device.createComputePipelineAsync({ layout: 'auto', compute: { module: unpackModule, entryPoint: 'main' } })
		]);

		const usage = (globalThis as any).GPUBufferUsage;
		const packParamsBuffer = device.createBuffer({ size: 32, usage: usage.UNIFORM | usage.COPY_DST });
		const unpackParamsBuffer = device.createBuffer({ size: 32, usage: usage.UNIFORM | usage.COPY_DST });

		const pipeline: FsrcnnGpuPipeline = { device, packPipeline, unpackPipeline, packParamsBuffer, unpackParamsBuffer };
		fsrcnnGpu = pipeline;
		return pipeline;
	})();

	return fsrcnnGpuInitPromise;
}

function ensureFsrcnnSizeResources(g: FsrcnnGpuPipeline, padW: number, padH: number, nativeScale: number) {
	const key = `${padW}x${padH}x${nativeScale}`;
	if (
		fsrcnnSizeKey === key &&
		fsrcnnSrcTexture &&
		fsrcnnOutPackedBuffer &&
		fsrcnnStagingBuffer &&
		fsrcnnPackBindGroup
	) {
		return;
	}
	fsrcnnSizeKey = key;

	const textureUsage = (globalThis as any).GPUTextureUsage;
	const bufferUsage = (globalThis as any).GPUBufferUsage;

	const outW = padW * nativeScale;
	const outH = padH * nativeScale;

	fsrcnnSrcTexture?.destroy();
	fsrcnnSrcTexture = g.device.createTexture({
		size: [padW, padH],
		format: 'rgba8unorm',
		usage: textureUsage.TEXTURE_BINDING | textureUsage.COPY_DST | textureUsage.RENDER_ATTACHMENT
	});

	const packedByteSize = outW * outH * 4;
	fsrcnnOutPackedBuffer?.destroy();
	fsrcnnOutPackedBuffer = g.device.createBuffer({
		size: packedByteSize,
		usage: bufferUsage.STORAGE | bufferUsage.COPY_SRC
	});

	fsrcnnStagingBuffer?.destroy();
	fsrcnnStagingBuffer = g.device.createBuffer({
		size: packedByteSize,
		usage: bufferUsage.COPY_DST | bufferUsage.MAP_READ
	});

	// Y-channel-only input buffer (float32).
	fsrcnnInputGpuBuffer?.destroy();
	fsrcnnInputGpuBuffer = g.device.createBuffer({
		size: padW * padH * 4,
		usage: bufferUsage.STORAGE | bufferUsage.COPY_DST | bufferUsage.COPY_SRC
	});

	fsrcnnPackBindGroup = g.device.createBindGroup({
		layout: g.packPipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: fsrcnnSrcTexture.createView() },
			{ binding: 1, resource: { buffer: fsrcnnInputGpuBuffer } },
			{ binding: 2, resource: { buffer: g.packParamsBuffer } }
		]
	});
}

/**
 * One FSRCNN pass for the requested scale. Runs the WebGPU pack -> inference
 * -> unpack pipeline when a GPU device is available and the active session
 * is on the webgpu execution provider; otherwise falls back to a CPU path
 * (full-frame getImageData -> sess.run() on WASM -> manual YCbCr recombine
 * against a CPU-drawn bilinear canvas for chroma), same as
 * sample_code/fsrcnn-worker.ts's non-GPU branch.
 *
 * Returns the model's actual native scale alongside the canvas because
 * FSRCNN's output size is read off the tensor's own dims rather than assumed
 * from the requested scale -- matching sample_code's defensive handling in
 * case a model's output doesn't exactly match padW/padH * scale.
 */
async function fsrcnnPass(
	sess: InferenceSession,
	source: CanvasImageSource,
	srcW: number,
	srcH: number,
	requestedScale: UpscaleScale
): Promise<{ canvas: OffscreenCanvas; modelScale: number; outW: number; outH: number }> {
	const inputName = sess.inputNames[0];
	const padW = Math.ceil(srcW / 16) * 16;
	const padH = Math.ceil(srcH / 16) * 16;
	const outW = padW * requestedScale;
	const outH = padH * requestedScale;

	if (!fsrcnnOutCanvas || fsrcnnOutCanvas.width !== outW || fsrcnnOutCanvas.height !== outH) {
		fsrcnnOutCanvas = new OffscreenCanvas(outW, outH);
		fsrcnnOutCtx = fsrcnnOutCanvas.getContext('2d')!;
	}

	const device = (env as any).webgpu?.device as GPUDevice | undefined;
	let modelScale: number = requestedScale;

	if (device && fsrcnnActiveProvider === 'webgpu') {
		const g = await ensureFsrcnnGpuPipeline(device);
		ensureFsrcnnSizeResources(g, padW, padH, requestedScale);

		device.queue.copyExternalImageToTexture({ source: source as any }, { texture: fsrcnnSrcTexture! }, [srcW, srcH]);

		const packParams = new Uint32Array(8);
		packParams[0] = 0; // tileX
		packParams[1] = 0; // tileY
		packParams[2] = srcW;
		packParams[3] = srcH;
		packParams[4] = 0; // batchSlot
		packParams[5] = padW;
		packParams[6] = padH;
		device.queue.writeBuffer(g.packParamsBuffer, 0, packParams);

		let encoder = device.createCommandEncoder();
		let pass = encoder.beginComputePass();
		pass.setPipeline(g.packPipeline);
		pass.setBindGroup(0, fsrcnnPackBindGroup!);
		pass.dispatchWorkgroups(padW / 16, padH / 16);
		pass.end();
		device.queue.submit([encoder.finish()]);

		const inputTensor = Tensor.fromGpuBuffer(fsrcnnInputGpuBuffer!, {
			dataType: 'float32',
			dims: [1, 1, padH, padW]
		});

		let outputTensor;
		try {
			const results = await sess.run({ [inputName]: inputTensor });
			outputTensor = results[sess.outputNames[0]];
		} catch (err) {
			inputTensor.dispose();
			throw err;
		}

		// FSRCNN's graph has CPU-side shape ops and dynamic shapes -- session
		// creation can succeed on WebGPU while the output tensor still comes
		// back CPU-resident rather than as a GPU buffer. Accept that (download
		// + re-upload) rather than fighting it with preferredOutputLocation,
		// which the sample found conflicts and produces a blank frame.
		let outGpuBuffer: GPUBuffer;
		let isOwnBuffer = false;
		let ortGpuBuffer: GPUBuffer | undefined;
		try {
			ortGpuBuffer = (outputTensor as any).gpuBuffer as GPUBuffer;
		} catch {
			// Tensor is CPU-resident -- outputTensor.gpuBuffer throws rather than
			// returning undefined, so this just means "not on the GPU".
		}

		if (ortGpuBuffer) {
			outGpuBuffer = ortGpuBuffer;
		} else {
			const outputData = (await outputTensor.getData()) as Float32Array;
			const bufUsage = (globalThis as any).GPUBufferUsage;
			outGpuBuffer = device.createBuffer({
				size: outputData.byteLength,
				usage: bufUsage.STORAGE | bufUsage.COPY_DST | bufUsage.COPY_SRC
			});
			device.queue.writeBuffer(outGpuBuffer, 0, outputData);
			isOwnBuffer = true;
		}

		const modelOutH = outputTensor.dims[2] as number;
		const modelOutW = outputTensor.dims[3] as number;
		modelScale = Math.round(modelOutW / padW);

		const unpackBindGroup = device.createBindGroup({
			layout: g.unpackPipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: { buffer: outGpuBuffer } },
				{ binding: 1, resource: fsrcnnSrcTexture!.createView() },
				{ binding: 2, resource: { buffer: fsrcnnOutPackedBuffer! } },
				{ binding: 3, resource: { buffer: g.unpackParamsBuffer } }
			]
		});

		const unpackParams = new Uint32Array(8);
		unpackParams[0] = 0; // dstX
		unpackParams[1] = 0; // dstY
		unpackParams[2] = outW; // dstStride
		unpackParams[3] = 0; // batchSlot
		unpackParams[4] = modelOutW;
		unpackParams[5] = modelOutH;
		unpackParams[6] = modelScale;
		device.queue.writeBuffer(g.unpackParamsBuffer, 0, unpackParams);

		encoder = device.createCommandEncoder();
		pass = encoder.beginComputePass();
		pass.setPipeline(g.unpackPipeline);
		pass.setBindGroup(0, unpackBindGroup);
		pass.dispatchWorkgroups(Math.ceil(modelOutW / 16), Math.ceil(modelOutH / 16));
		pass.end();
		device.queue.submit([encoder.finish()]);

		inputTensor.dispose();
		outputTensor.dispose();
		if (isOwnBuffer) outGpuBuffer.destroy();

		const bytesPerRow = outW * 4; // storage buffer, not a texture -- no 256-byte alignment requirement
		const readEncoder = device.createCommandEncoder();
		readEncoder.copyBufferToBuffer(fsrcnnOutPackedBuffer!, 0, fsrcnnStagingBuffer!, 0, fsrcnnOutPackedBuffer!.size);
		device.queue.submit([readEncoder.finish()]);
		await device.queue.onSubmittedWorkDone();

		await fsrcnnStagingBuffer!.mapAsync((globalThis as any).GPUMapMode.READ);
		const packedBytes = new Uint8ClampedArray(fsrcnnStagingBuffer!.getMappedRange().slice(0));
		fsrcnnStagingBuffer!.unmap();
		void bytesPerRow;

		fsrcnnOutCtx!.putImageData(new ImageData(packedBytes, outW, outH), 0, 0);
	} else {
		// ---- CPU/WASM fallback ----
		if (!fsrcnnInCanvas || fsrcnnInCanvas.width !== padW || fsrcnnInCanvas.height !== padH) {
			fsrcnnInCanvas = new OffscreenCanvas(padW, padH);
			fsrcnnInCtx = fsrcnnInCanvas.getContext('2d', { willReadFrequently: true })!;
		}
		fsrcnnInCtx!.clearRect(0, 0, padW, padH);
		fsrcnnInCtx!.drawImage(source, 0, 0);

		const fullIn = fsrcnnInCtx!.getImageData(0, 0, padW, padH);
		const inData = fullIn.data;
		const len = padW * padH;
		if (fsrcnnFloatData.length !== len) fsrcnnFloatData = new Float32Array(len);

		for (let ry = 0; ry < padH; ry++) {
			const srcRowStart = ry * padW * 4;
			const dstRowStart = ry * padW;
			for (let rx = 0; rx < padW; rx++) {
				const s = srcRowStart + rx * 4;
				const d = dstRowStart + rx;
				const r = inData[s] / 255;
				const g = inData[s + 1] / 255;
				const b = inData[s + 2] / 255;
				fsrcnnFloatData[d] = 0.299 * r + 0.587 * g + 0.114 * b;
			}
		}

		const inputTensor = new Tensor('float32', fsrcnnFloatData, [1, 1, padH, padW]);
		const results = await sess.run({ [inputName]: inputTensor });
		const outputTensor = results[sess.outputNames[0]];
		const outData = outputTensor.data as Float32Array;

		const modelOutH = outputTensor.dims[2] as number;
		const modelOutW = outputTensor.dims[3] as number;
		modelScale = Math.round(modelOutW / padW);

		if (
			!fsrcnnBilinearCanvas ||
			fsrcnnBilinearCanvas.width !== modelOutW ||
			fsrcnnBilinearCanvas.height !== modelOutH
		) {
			fsrcnnBilinearCanvas = new OffscreenCanvas(modelOutW, modelOutH);
			fsrcnnBilinearCtx = fsrcnnBilinearCanvas.getContext('2d')!;
		}
		fsrcnnBilinearCtx!.imageSmoothingEnabled = true;
		fsrcnnBilinearCtx!.imageSmoothingQuality = 'high';
		fsrcnnBilinearCtx!.drawImage(source as any, 0, 0, srcW, srcH, 0, 0, modelOutW, modelOutH);
		const bilinearData = fsrcnnBilinearCtx!.getImageData(0, 0, modelOutW, modelOutH).data;

		const outBufLen = outW * outH * 4;
		if (fsrcnnCpuOutBuffer.length !== outBufLen) {
			fsrcnnCpuOutBuffer = new Uint8ClampedArray(outBufLen);
		}

		for (let ry = 0; ry < modelOutH; ry++) {
			const dstRowStart = ry * outW * 4;
			const srcRowStart = ry * modelOutW;
			for (let rx = 0; rx < modelOutW; rx++) {
				const d = dstRowStart + rx * 4;
				const si = srcRowStart + rx;
				const newY = outData[si];

				const rBilinear = bilinearData[d] / 255;
				const gBilinear = bilinearData[d + 1] / 255;
				const bBilinear = bilinearData[d + 2] / 255;

				const u = -0.14713 * rBilinear - 0.28886 * gBilinear + 0.436 * bBilinear;
				const v = 0.615 * rBilinear - 0.51499 * gBilinear - 0.10001 * bBilinear;

				const r = newY + 1.13983 * v;
				const g = newY - 0.39465 * u - 0.5806 * v;
				const b = newY + 2.03211 * u;

				fsrcnnCpuOutBuffer[d] = r * 255;
				fsrcnnCpuOutBuffer[d + 1] = g * 255;
				fsrcnnCpuOutBuffer[d + 2] = b * 255;
				fsrcnnCpuOutBuffer[d + 3] = 255;
			}
		}

		fsrcnnOutCtx!.putImageData(new ImageData(fsrcnnCpuOutBuffer, outW, outH), 0, 0);
	}

	return { canvas: fsrcnnOutCanvas!, modelScale, outW, outH };
}

async function runFsrcnnPass(
	sess: InferenceSession,
	scale: UpscaleScale,
	source: CanvasImageSource,
	srcW: number,
	srcH: number
) {
	try {
		return await fsrcnnPass(sess, source, srcW, srcH, scale);
	} catch (err) {
		const current = fsrcnnSessions.get(scale);
		if (current && current !== sess) {
			return await fsrcnnPass(current, source, srcW, srcH, scale);
		}
		if (fsrcnnActiveProvider === 'wasm') throw err;
		console.error('[upscale-fsrcnn.worker] FSRCNN WebGPU inference failed, falling back to WASM:', err);
		const wasmSess = await fallbackFsrcnnToWasm(scale);
		return await fsrcnnPass(wasmSess, source, srcW, srcH, scale);
	}
}

/** Orchestrates a single FSRCNN pass and crops off tile-alignment padding to
 * land on the exact target size -- same final step as imdnUpscale in
 * upscale.worker.ts. No cascading: fsrcnn_x2.onnx / fsrcnn_x4.onnx are each
 * already native to their scale. */
async function fsrcnnUpscale(sample: VideoSample, scale: UpscaleScale): Promise<OffscreenCanvas> {
	const t0 = performance.now();
	const sess = await loadFsrcnnModel(scale);

	const source = sample.toCanvasImageSource();
	const { width, height } = getFrameSize(source);

	const { canvas, modelScale } = await runFsrcnnPass(sess, scale, source, width, height);

	const finalW = width * scale;
	const finalH = height * scale;
	if (!fsrcnnFinalCanvas || fsrcnnFinalCanvas.width !== finalW || fsrcnnFinalCanvas.height !== finalH) {
		fsrcnnFinalCanvas = new OffscreenCanvas(finalW, finalH);
		fsrcnnFinalCtx = fsrcnnFinalCanvas.getContext('2d')!;
	}
	// Crop from the model's actual output size down to the exact target.
	// IMPORTANT: the source rect here must be `width * modelScale` /
	// `height * modelScale` -- the UNPADDED source dims times the model's
	// real scale -- not `padW * modelScale`/`padH * modelScale`. padW/padH
	// (see fsrcnnPass) are rounded UP to the next multiple of 16, so they're
	// bigger than the real frame; using them here would stretch a source
	// rect that still includes that extra padding margin down into a
	// finalW x finalH canvas sized for the *unpadded* content, squeezing the
	// whole frame -- the visible symptom being the upscaled preview looking
	// zoomed out / smaller than the original in the before/after slider,
	// since every pixel lands slightly inside of where it should. modelScale
	// is read off the tensor's own dims rather than assumed to equal `scale`,
	// matching sample_code/fsrcnn-worker.ts's defensive handling in case a
	// model's real output doesn't match width/height * scale exactly.
	fsrcnnFinalCtx!.drawImage(canvas, 0, 0, width * modelScale, height * modelScale, 0, 0, finalW, finalH);

	fsrcnnPerfFrames++;
	fsrcnnPerfTotalMs += performance.now() - t0;
	if (fsrcnnPerfFrames === 1 || fsrcnnPerfFrames % 15 === 0) {
		console.log(
			`[upscale-fsrcnn.worker/ai/${fsrcnnActiveProvider}] frame ${fsrcnnPerfFrames}: avg ${(fsrcnnPerfTotalMs / fsrcnnPerfFrames).toFixed(1)}ms/frame`
		);
	}

	return fsrcnnFinalCanvas;
}

// ===================================================================================
// FSR engine -- unchanged from upscale.worker.ts (adapted from
// sample_code/upscale-worker.ts + fsr-shaders.ts). Copied over as-is: which
// AI model runs on the <=720p path has no bearing on this one.
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
			console.warn('[upscale-fsrcnn.worker] WebGPU init failed for FSR, falling back to Canvas 2D:', err);
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
			`[upscale-fsrcnn.worker/fsr/${fsrActiveProvider}] frame ${fsrPerfFrames}: avg ${(fsrPerfTotalMs / fsrPerfFrames).toFixed(1)}ms/frame`
		);
	}

	return fsrFinalCanvas;
}

// ===================================================================================
// Orchestration: probe -> route -> convert (identical to upscale.worker.ts,
// except the AI branch calls the FSRCNN loader/upscaler above).
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

	if (plan.engine === 'ai') {
		await loadFsrcnnModel(
			scale,
			(fraction) => {
				post({
					type: 'progress',
					progress: Math.round(fraction * 100),
					stage: 'loading-engine',
					engine: plan.engine
				});
			},
			() => {
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
					return await fsrcnnUpscale(sample, plan.scale);
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
		console.error('[upscale-fsrcnn.worker] upscale failed:', error);
		post({ type: 'error', message: error instanceof Error ? error.message : 'Upscaling failed' });
	});
};

export {};

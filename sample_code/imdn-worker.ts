import { env, InferenceSession, Tensor } from 'onnxruntime-web/webgpu';
import { setupWasmCache } from './ort-wasm-cache';
import {
  Input,
  Output,
  Conversion,
  BlobSource,
  BufferTarget,
  Mp4OutputFormat,
  ALL_FORMATS,
  Quality,
  VideoSample
} from 'mediabunny';

setupWasmCache();
env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/';

// ---------------------------------------------------------------------------------
// Models: IMDN_RTE (nf=20) - always x2
// ---------------------------------------------------------------------------------
const MODEL_PATH = '/ai/imdn_rte_x2.onnx';
let session: InferenceSession | null = null;

/**
 * Which execution provider actually ended up running the model. Used to decide
 * whether to feed the model a GPU-buffer tensor (WebGPU EP) or a plain CPU
 * tensor (WASM EP).
 */
let activeProvider: 'webgpu' | 'wasm' | null = null;
let graphCaptureActive = false;

// ---------------------------------------------------------------------------------
// Perf counters — logged every 15 frames via the LOG channel.
// ---------------------------------------------------------------------------------
let perfFrames = 0;
let perfPasses = 0;
let perfInferenceMs = 0;
let perfReadbackMs = 0;
let perfFrameTotalMs = 0;

// ---------------------------------------------------------------------------------
// WGSL compute shader for GPU pixel-format conversion:
//   - PACK_WGSL:   RGBA8 texture → f32 planar buffer (model input)
// Output unpacking is done on CPU after getData() readback to avoid
// NCHW/NHWC layout ambiguity with ONNX Runtime WebGPU EP.
// ---------------------------------------------------------------------------------
const PACK_WGSL = `
struct PackParams {
  tileX: u32,
  tileY: u32,
  srcW: u32,
  srcH: u32,
  batchSlot: u32,
  padW: u32,
  padH: u32,
  useNhwc: u32,
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

  let cx = min(sx, params.srcW - 1u);
  let cy = min(sy, params.srcH - 1u);
  let px = textureLoad(srcTex, vec2<u32>(cx, cy), 0);

  let planeLen = params.padW * params.padH;
  let batchOffset = params.batchSlot * 3u * planeLen;
  let idx = gid.y * params.padW + gid.x;

  if (params.useNhwc == 1u) {
    // NHWC layout: interleaved [R,G,B, R,G,B, ...]
    let nhwcIdx = batchOffset + idx * 3u;
    outBuf[nhwcIdx] = px.r * 255.0;
    outBuf[nhwcIdx + 1u] = px.g * 255.0;
    outBuf[nhwcIdx + 2u] = px.b * 255.0;
  } else {
    // NCHW layout: planar [RRR...GGG...BBB...]
    outBuf[batchOffset + idx] = px.r * 255.0;
    outBuf[batchOffset + planeLen + idx] = px.g * 255.0;
    outBuf[batchOffset + 2u * planeLen + idx] = px.b * 255.0;
  }
}
`;


// ---------------------------------------------------------------------------------
// GPU pipeline (shared across all passes — pipelines and param buffers are
// shape-independent).
// ---------------------------------------------------------------------------------
interface GpuPipeline {
  device: GPUDevice;
  packPipeline: GPUComputePipeline;
  packParamsBuffer: GPUBuffer;
}

let gpu: GpuPipeline | null = null;
let gpuInitPromise: Promise<GpuPipeline> | null = null;

async function ensureGpuPipeline(device: GPUDevice): Promise<GpuPipeline> {
  if (gpu) return gpu;
  if (gpuInitPromise) return gpuInitPromise;

  gpuInitPromise = (async () => {
    self.postMessage({ type: 'LOG', data: 'Compiling upscale compute shaders...' });

    const packModule = device.createShaderModule({ code: PACK_WGSL });

    const packPipeline = await device.createComputePipelineAsync(
      { layout: 'auto', compute: { module: packModule, entryPoint: 'main' } }
    );

    const usage = (globalThis as any).GPUBufferUsage;

    const packParamsBuffer = device.createBuffer({
      size: 32, // 8 × u32 — matches PackParams WGSL struct
      usage: usage.UNIFORM | usage.COPY_DST
    });

    const pipeline: GpuPipeline = {
      device,
      packPipeline,
      packParamsBuffer
    };
    gpu = pipeline;
    return pipeline;
  })();

  return gpuInitPromise;
}

// ---------------------------------------------------------------------------------
// Size-dependent GPU resources.
// ---------------------------------------------------------------------------------
interface SizeResources {
  srcTexture: GPUTexture;
  inputGpuBuffer: GPUBuffer;
  packBindGroup: GPUBindGroup;
  outCanvas: OffscreenCanvas;
  outCtx: OffscreenCanvasRenderingContext2D;
  outW: number;
  outH: number;
}

const sizeCache = new Map<string, SizeResources>();

function getSizeResources(g: GpuPipeline, padW: number, padH: number): SizeResources {
  const key = `${padW}x${padH}`;
  const cached = sizeCache.get(key);
  if (cached) return cached;

  const textureUsage = (globalThis as any).GPUTextureUsage;
  const bufferUsage = (globalThis as any).GPUBufferUsage;

  const srcTexture = g.device.createTexture({
    size: [padW, padH],
    format: 'rgba8unorm',
    usage: textureUsage.TEXTURE_BINDING | textureUsage.COPY_DST | textureUsage.RENDER_ATTACHMENT
  });

  const scale = 2; // IMDN_RTE strictly scales by 2x
  const outW = padW * scale;
  const outH = padH * scale;

  const inputGpuBuffer = g.device.createBuffer({
    size: 3 * padW * padH * 4,
    usage: bufferUsage.STORAGE | bufferUsage.COPY_DST | bufferUsage.COPY_SRC
  });

  const packBindGroup = g.device.createBindGroup({
    layout: g.packPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: srcTexture.createView() },
      { binding: 1, resource: { buffer: inputGpuBuffer } },
      { binding: 2, resource: { buffer: g.packParamsBuffer } }
    ]
  });

  const outCanvas = new OffscreenCanvas(outW, outH);
  const outCtx = outCanvas.getContext('2d')!;

  const res: SizeResources = { srcTexture, inputGpuBuffer, packBindGroup, outCanvas, outCtx, outW, outH };
  sizeCache.set(key, res);
  return res;
}

// ---------------------------------------------------------------------------------
// Model loading
// ---------------------------------------------------------------------------------
async function loadModel(): Promise<InferenceSession> {
  if (session) return session;

  if (navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      const requiredLimits: Record<string, number> = {};
      if (adapter) {
        if (adapter.limits.maxStorageBufferBindingSize)
          requiredLimits.maxStorageBufferBindingSize = adapter.limits.maxStorageBufferBindingSize;
        if (adapter.limits.maxBufferSize)
          requiredLimits.maxBufferSize = adapter.limits.maxBufferSize;
      }
      const requiredFeatures: GPUFeatureName[] = [];
      const f16Supported = !!adapter?.features.has('shader-f16');
      if (f16Supported) {
        requiredFeatures.push('shader-f16');
      }
      self.postMessage({
        type: 'LOG',
        data: `WebGPU shader-f16: ${f16Supported ? 'YES' : 'NO'}`
      });
      const device = await adapter?.requestDevice({ requiredLimits, requiredFeatures });
      if (device) {
        (env as any).webgpu = (env as any).webgpu || {};
        (env as any).webgpu.device = device;
      }
    } catch (err) {
      console.warn('WebGPU device init failed (falling back to CPU pixel conversion):', err);
    }
  }

  try {
    session = await InferenceSession.create(MODEL_PATH, {
      executionProviders: [{
        name: 'webgpu',
        preferredLayout: 'NCHW'
      }]
    });
    activeProvider = 'webgpu';
    self.postMessage({ type: 'LOG', data: 'Model loaded (WebGPU)!' });
  } catch (err: any) {
    session = await InferenceSession.create(MODEL_PATH, {
      executionProviders: ['wasm']
    });
    activeProvider = 'wasm';
    self.postMessage({ type: 'LOG', data: 'Model loaded (WASM)!' });
  }

  return session;
}

// ---------------------------------------------------------------------------------
// Runtime WebGPU failure fallback
// ---------------------------------------------------------------------------------
// Session creation can succeed on WebGPU (adapter/device init is fine) while a
// specific kernel still fails to compile lazily on the first sess.run() -- seen
// on Firefox's WebGPU/Metal backend for the DepthToSpace (pixel-shuffle) op.
// That happens deep inside inference, after loadModel() already returned, so
// it has to be caught here and recovered by rebuilding the session on WASM.
async function fallbackToWasm(): Promise<InferenceSession> {
  self.postMessage({
    type: 'LOG',
    data: 'WebGPU inference failed at runtime -- falling back to WASM (CPU)...'
  });
  try {
    await session?.release();
  } catch {
    // Ignore release errors -- we're replacing this session anyway.
  }
  session = await InferenceSession.create(MODEL_PATH, {
    executionProviders: ['wasm']
  });
  activeProvider = 'wasm';
  self.postMessage({ type: 'LOG', data: 'Model reloaded (WASM)!' });
  return session;
}

async function runInference(sess: InferenceSession, inputTensor: Tensor) {
  try {
    return await sess.run({ [sess.inputNames[0]]: inputTensor });
  } catch (err) {
    // A fresher session may already exist if an earlier pass in this same
    // frame (or an earlier frame) already fell back -- reuse it instead of
    // re-triggering the fallback and instead of failing this call outright.
    if (session && session !== sess) {
      return await session.run({ [session.inputNames[0]]: inputTensor });
    }
    if (activeProvider === 'wasm') {
      throw err; // Already on the CPU fallback -- nothing else to try.
    }
    console.error('WebGPU sess.run() failed, falling back to WASM:', err);
    const wasmSess = await fallbackToWasm();
    return await wasmSess.run({ [wasmSess.inputNames[0]]: inputTensor });
  }
}

// ---------------------------------------------------------------------------------
// GPU path
// ---------------------------------------------------------------------------------
async function gpuPass(
  g: GpuPipeline,
  device: GPUDevice,
  sess: InferenceSession,
  source: CanvasImageSource,
  srcW: number,
  srcH: number
): Promise<OffscreenCanvas> {
  const padW = Math.ceil(srcW / 16) * 16;
  const padH = Math.ceil(srcH / 16) * 16;
  const res = getSizeResources(g, padW, padH);
  const { outW, outH } = res;

  device.queue.copyExternalImageToTexture({ source: source as any }, { texture: res.srcTexture }, [srcW, srcH]);

  // PACK shader writes NCHW planar layout: ORT will handle internal conversion
  const packParams = new Uint32Array(8);
  packParams[0] = 0; packParams[1] = 0; packParams[2] = srcW; packParams[3] = srcH; packParams[4] = 0; packParams[5] = padW; packParams[6] = padH; packParams[7] = 0;
  device.queue.writeBuffer(g.packParamsBuffer, 0, packParams);

  let encoder = device.createCommandEncoder();
  let pass = encoder.beginComputePass();
  pass.setPipeline(g.packPipeline);
  pass.setBindGroup(0, res.packBindGroup);
  pass.dispatchWorkgroups(padW / 16, padH / 16);
  pass.end();
  device.queue.submit([encoder.finish()]);

  const inferT0 = performance.now();
  const inputTensor = Tensor.fromGpuBuffer(res.inputGpuBuffer, { dataType: 'float32', dims: [1, 3, padH, padW] });
  // Let ONNX Runtime allocate and manage the output buffer itself to avoid
  // NCHW/NHWC layout mismatch — the pre-allocated output buffer approach caused
  // stripe artifacts because WebGPU EP may use NHWC layout internally.
  const results = await runInference(sess, inputTensor);
  inputTensor.dispose();
  const outputTensor = results[sess.outputNames[0]];

  // getData() returns NCHW-ordered float32 data regardless of internal GPU layout
  const outFloatData = await outputTensor.getData() as Float32Array;
  outputTensor.dispose();
  perfInferenceMs += performance.now() - inferT0;
  perfPasses += 1;

  // Unpack NCHW float32 → RGBA8 on CPU
  const readbackT0 = performance.now();
  const outLen = outW * outH;
  const outBufLen = outW * outH * 4;
  if (gpuUnpackBuffer.length !== outBufLen) gpuUnpackBuffer = new Uint8ClampedArray(outBufLen);

  for (let ry = 0; ry < outH; ry++) {
    const dstRowStart = ry * outW * 4;
    const srcRowStart = ry * outW;
    for (let rx = 0; rx < outW; rx++) {
      const d = dstRowStart + rx * 4;
      const si = srcRowStart + rx;
      gpuUnpackBuffer[d] = Math.max(0, Math.min(255, outFloatData[si]));
      gpuUnpackBuffer[d + 1] = Math.max(0, Math.min(255, outFloatData[outLen + si]));
      gpuUnpackBuffer[d + 2] = Math.max(0, Math.min(255, outFloatData[2 * outLen + si]));
      gpuUnpackBuffer[d + 3] = 255;
    }
  }
  perfReadbackMs += performance.now() - readbackT0;

  res.outCtx.putImageData(new ImageData(gpuUnpackBuffer, outW, outH), 0, 0);
  return res.outCanvas;
}

// ---------------------------------------------------------------------------------
// CPU/WASM fallback path
// ---------------------------------------------------------------------------------
let cpuFloatData = new Float32Array(0);
let cpuOutBuffer = new Uint8ClampedArray(0);
let gpuUnpackBuffer = new Uint8ClampedArray(0);
let cpuInCanvas: OffscreenCanvas | null = null;
let cpuInCtx: OffscreenCanvasRenderingContext2D | null = null;
let cpuOutCanvas: OffscreenCanvas | null = null;
let cpuOutCtx: OffscreenCanvasRenderingContext2D | null = null;

async function cpuPass(
  sess: InferenceSession,
  source: CanvasImageSource,
  srcW: number,
  srcH: number
): Promise<OffscreenCanvas> {
  const padW = Math.ceil(srcW / 16) * 16;
  const padH = Math.ceil(srcH / 16) * 16;
  const outW = padW * 2;
  const outH = padH * 2;

  if (!cpuInCanvas || cpuInCanvas.width !== padW || cpuInCanvas.height !== padH) {
    cpuInCanvas = new OffscreenCanvas(padW, padH);
    cpuInCtx = cpuInCanvas.getContext('2d', { willReadFrequently: true })!;
  }
  cpuInCtx!.clearRect(0, 0, padW, padH);
  cpuInCtx!.drawImage(source, 0, 0);

  const fullIn = cpuInCtx!.getImageData(0, 0, padW, padH);
  const inData = fullIn.data;
  const len = padW * padH;
  if (cpuFloatData.length !== 3 * len) cpuFloatData = new Float32Array(3 * len);

  // Edge replicate padding
  for (let ry = 0; ry < padH; ry++) {
    const cy = Math.min(ry, srcH - 1);
    for (let rx = 0; rx < padW; rx++) {
      const cx = Math.min(rx, srcW - 1);
      const si = (cy * padW + cx) * 4;
      const di = ry * padW + rx;
      cpuFloatData[di] = inData[si];
      cpuFloatData[len + di] = inData[si + 1];
      cpuFloatData[2 * len + di] = inData[si + 2];
    }
  }

  const inferT0 = performance.now();
  const inputTensor = new Tensor('float32', cpuFloatData, [1, 3, padH, padW]);
  const results = await runInference(sess, inputTensor);
  const outFloatData = results[sess.outputNames[0]].data as Float32Array;
  perfInferenceMs += performance.now() - inferT0;
  perfPasses++;

  const outLen = outW * outH;
  const outBufLen = outW * outH * 4;
  if (cpuOutBuffer.length !== outBufLen) cpuOutBuffer = new Uint8ClampedArray(outBufLen);

  for (let ry = 0; ry < outH; ry++) {
    const dstRowStart = ry * outW * 4;
    const srcRowStart = ry * outW;
    for (let rx = 0; rx < outW; rx++) {
      const d = dstRowStart + rx * 4;
      const si = srcRowStart + rx;
      cpuOutBuffer[d] = outFloatData[si];
      cpuOutBuffer[d + 1] = outFloatData[outLen + si];
      cpuOutBuffer[d + 2] = outFloatData[2 * outLen + si];
      cpuOutBuffer[d + 3] = 255;
    }
  }

  if (!cpuOutCanvas || cpuOutCanvas.width !== outW || cpuOutCanvas.height !== outH) {
    cpuOutCanvas = new OffscreenCanvas(outW, outH);
    cpuOutCtx = cpuOutCanvas.getContext('2d')!;
  }
  cpuOutCtx!.putImageData(new ImageData(cpuOutBuffer, outW, outH), 0, 0);

  return cpuOutCanvas;
}

// ---------------------------------------------------------------------------------
// processFrame: orchestrates 1 pass (2×) or 2 passes (4× via cascade)
// ---------------------------------------------------------------------------------
let finalCanvas: OffscreenCanvas | null = null;
let finalCtx: OffscreenCanvasRenderingContext2D | null = null;

function getFrameSize(source: CanvasImageSource): { width: number; height: number } {
  if ('displayWidth' in source) {
    return { width: (source as VideoFrame).displayWidth, height: (source as VideoFrame).displayHeight };
  }
  return { width: source.width as number, height: source.height as number };
}

async function processFrame(sample: VideoSample, scaleFactor: number): Promise<OffscreenCanvas> {
  const frameT0 = performance.now();
  const sess = await loadModel();

  const source = sample.toCanvasImageSource();
  const { width, height } = getFrameSize(source);

  const device = (env as any).webgpu?.device as GPUDevice | undefined;
  const useGpu = !!(device && activeProvider === 'webgpu');
  
  let resultCanvas: OffscreenCanvas;
  let actualW: number;
  let actualH: number;

  // Always use cpuPass for input/output marshaling. The ONNX Runtime WebGPU EP
  // still runs inference on GPU — it handles CPU→GPU data transfer internally.
  // Using fromGpuBuffer with custom PACK shaders caused stripe artifacts due to
  // NCHW/NHWC layout mismatch between the shader output and ORT's expectations.
  const pass1 = await cpuPass(sess, source, width, height);
  actualW = width * 2;
  actualH = height * 2;

  if (scaleFactor === 4) {
    const bitmap = await createImageBitmap(pass1, 0, 0, actualW, actualH);
    resultCanvas = await cpuPass(sess, bitmap, actualW, actualH);
    bitmap.close();
    actualW *= 2;
    actualH *= 2;
  } else {
    resultCanvas = pass1;
  }

  // Crop off tile-alignment padding and land on the exact target size.
  const finalW = width * scaleFactor;
  const finalH = height * scaleFactor;

  if (!finalCanvas || finalCanvas.width !== finalW || finalCanvas.height !== finalH) {
    finalCanvas = new OffscreenCanvas(finalW, finalH);
    finalCtx = finalCanvas.getContext('2d')!;
  }

  finalCtx!.drawImage(resultCanvas, 0, 0, actualW, actualH, 0, 0, finalW, finalH);

  // Perf logging
  perfFrames++;
  perfFrameTotalMs += performance.now() - frameT0;
  if (perfFrames === 1 || perfFrames % 15 === 0) {
    self.postMessage({
      type: 'LOG',
      data:
        `[perf/${activeProvider}${graphCaptureActive ? '+gc' : ''}] ` +
        `frame ${perfFrames}: ` +
        `avg inference=${(perfInferenceMs / perfPasses).toFixed(1)}ms/pass, ` +
        (useGpu ? `avg readback=${(perfReadbackMs / perfPasses).toFixed(1)}ms/pass, ` : '') +
        `avg total=${(perfFrameTotalMs / perfFrames).toFixed(1)}ms/frame`
    });
  }

  return finalCanvas;
}

// ---------------------------------------------------------------------------------
// Worker message handler
// ---------------------------------------------------------------------------------
self.onmessage = async (e) => {
  const { type, data } = e.data;

  if (type === 'START') {
    try {
      const { file, scale } = data;
      const scaleFactor = scale === 2 ? 2 : 4;

      self.postMessage({ type: 'LOG', data: `Started upscaling ${scaleFactor}x (IMDN_RTE, ${scaleFactor === 4 ? 'cascade 2x+2x' : 'single pass'})...` });

      const outName = file.name.replace(/\.[^.]+$/, '') + `-upscaled-${scaleFactor}x.mp4`;

      const input = new Input({
        formats: ALL_FORMATS,
        source: new BlobSource(file)
      });

      const primaryVideoTrack = await input.getPrimaryVideoTrack();
      if (!primaryVideoTrack) {
        throw new Error('No video track found in file.');
      }

      const srcDisplayWidth = await primaryVideoTrack.getDisplayWidth();
      const srcDisplayHeight = await primaryVideoTrack.getDisplayHeight();

      const bufferTarget = new BufferTarget();
      const output = new Output({
        format: new Mp4OutputFormat(),
        target: bufferTarget
      });

      const conversion = await Conversion.init({
        input,
        output,
        video: {
          codec: 'avc',
          quality: new Quality('high'),
          process: async (sample: VideoSample) => {
            return await processFrame(sample, scaleFactor);
          },
          processedWidth: srcDisplayWidth * scaleFactor,
          processedHeight: srcDisplayHeight * scaleFactor
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
        self.postMessage({ type: 'PROGRESS', data: progress });
      };

      await conversion.execute();

      if (!bufferTarget.buffer) {
        throw new Error('MediaBunny produced no output.');
      }

      const outBlob = new Blob([bufferTarget.buffer], { type: 'video/mp4' });
      const blobUrl = URL.createObjectURL(outBlob);

      self.postMessage({
        type: 'DONE',
        data: {
          blobUrl,
          outName,
          originalSize: file.size,
          newSize: outBlob.size
        }
      });
    } catch (err: any) {
      console.error(err);
      self.postMessage({ type: 'ERROR', error: err.message || String(err) });
    }
  }
};

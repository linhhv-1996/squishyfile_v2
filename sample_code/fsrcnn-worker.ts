import { env, InferenceSession, Tensor } from "onnxruntime-web/webgpu";
import { setupWasmCache } from "./ort-wasm-cache";
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
} from "mediabunny";

setupWasmCache();
env.wasm.wasmPaths =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/";
env.logLevel = "error";

let inputGpuBuffer: GPUBuffer | null = null;
let session: InferenceSession | null = null;

// ===== Cấu hình =====
let NATIVE_SCALE = 2; // scale từ UI

// ===== Perf counters =====
let perfFrames = 0;
let perfTiles = 0;
let perfInferenceMs = 0;
let perfOtherMs = 0;
let perfReadbackMs = 0;
let perfReadbackWorkDoneMs = 0;
let perfReadbackMapMs = 0;
let perfFrameTotalMs = 0;

// ===== CPU fallback =====
let floatData = new Float32Array(0);
let cpuOutBuffer: Uint8ClampedArray<ArrayBuffer> | null = null;

// ===== WebGPU pipeline =====
// FSRCNN chỉ output Y channel (luminance). Ta cần kết hợp với chroma (Cb/Cr)
// từ ảnh gốc. Thay vì tạo bilinear canvas trên CPU rồi upload lại GPU
// (tốn ~100ms mỗi frame), ta dùng trực tiếp srcTexture đã có sẵn trên GPU
// và thực hiện chuyển đổi YCbCr→RGB hoàn toàn trong unpack shader.

const PACK_WGSL = /* wgsl */ `
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

// Unpack shader: model output (Y channel) + source texture (for Cb/Cr) → RGBA8
// Lấy chroma từ srcTexture bằng cách sample tại vị trí tương ứng (nearest neighbor
// từ ảnh gốc, thực chất là chroma upscale — giống FSRCNN paper gốc).
const UNPACK_WGSL = /* wgsl */ `
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
  
  // Model provides the high-res Y channel
  let new_y = modelOut[batchOffset + si];
  
  // Lấy chroma từ source texture (nearest neighbor lookup)
  let srcX = gid.x / params.scale;
  let srcY = gid.y / params.scale;
  let srcDims = textureDimensions(srcTex);
  let clampedX = min(srcX, srcDims.x - 1u);
  let clampedY = min(srcY, srcDims.y - 1u);
  let px_src = textureLoad(srcTex, vec2<u32>(clampedX, clampedY), 0);
  
  // RGB→YUV cho source pixel để lấy U, V
  let u = -0.14713 * px_src.r - 0.28886 * px_src.g + 0.436 * px_src.b;
  let v = 0.615 * px_src.r - 0.51499 * px_src.g - 0.10001 * px_src.b;
  
  // YUV→RGB kết hợp Y mới từ model + U/V từ source
  let r = new_y + 1.13983 * v;
  let g = new_y - 0.39465 * u - 0.58060 * v;
  let b = new_y + 2.03211 * u;
  
  let packed = pack4x8unorm(vec4<f32>(r, g, b, 1.0));
  let dstIdx = (params.dstY + gid.y) * params.dstStride + (params.dstX + gid.x);
  outPacked[dstIdx] = packed;
}
`;

interface GpuPipeline {
  device: GPUDevice;
  packPipeline: GPUComputePipeline;
  unpackPipeline: GPUComputePipeline;
  packParamsBuffer: GPUBuffer;
  unpackParamsBuffer: GPUBuffer;
}

let gpu: GpuPipeline | null = null;
let gpuInitPromise: Promise<GpuPipeline> | null = null;

let srcTexture: GPUTexture | null = null;
let packBindGroup: GPUBindGroup | null = null;
let outPackedBuffer: GPUBuffer | null = null;
let stagingBuffer: GPUBuffer | null = null;
let sizeKey = "";

let inCanvas: OffscreenCanvas | null = null;
let inCtx: OffscreenCanvasRenderingContext2D | null = null;
let outCanvas: OffscreenCanvas | null = null;
let outCtx: OffscreenCanvasRenderingContext2D | null = null;
let finalCanvas: OffscreenCanvas | null = null;
let finalCtx: OffscreenCanvasRenderingContext2D | null = null;

// CPU fallback canvases for bilinear
let bilinearCanvas: OffscreenCanvas | null = null;
let bilinearCtx: OffscreenCanvasRenderingContext2D | null = null;

let activeProvider: "webgpu" | "wasm" | null = null;
let graphCaptureActive = false;

async function loadModel(scale: number) {
  if (!session) {
    if (navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        const requiredLimits: Record<string, number> = {};
        if (adapter) {
          if (adapter.limits.maxStorageBufferBindingSize) {
            requiredLimits.maxStorageBufferBindingSize =
              adapter.limits.maxStorageBufferBindingSize;
          }
          if (adapter.limits.maxBufferSize) {
            requiredLimits.maxBufferSize = adapter.limits.maxBufferSize;
          }
        }
        const requiredFeatures: GPUFeatureName[] = [];
        const f16Supported = !!adapter?.features.has("shader-f16");
        if (f16Supported) requiredFeatures.push("shader-f16");

        self.postMessage({
          type: "LOG",
          data: `WebGPU adapter shader-f16 support: ${f16Supported ? "YES" : "NO"}`,
        });

        const device = await adapter?.requestDevice({
          requiredLimits,
          requiredFeatures,
        });
        if (device) {
          (env as any).webgpu = (env as any).webgpu || {};
          (env as any).webgpu.device = device;
        }
      } catch (err) {
        console.warn("WebGPU device init failed:", err);
      }
    }

    try {
      // FSRCNN model có node chạy trên CPU (shape ops) & dynamic shapes.
      // KHÔNG dùng preferredOutputLocation vì sẽ gây conflict → output rỗng (đen xì).
      // Chấp nhận việc ORT download output về CPU, sau đó tự upload lại GPU.
      session = await InferenceSession.create(`/ai/fsrcnn_x${scale}.onnx`, {
        executionProviders: ["webgpu"],
      });
      activeProvider = "webgpu";
      graphCaptureActive = false;
      self.postMessage({
        type: "LOG",
        data: "Model loaded (WebGPU, manual CPU->GPU fallback)",
      });
    } catch (err) {
      session = await InferenceSession.create(`/ai/fsrcnn_x${scale}.onnx`, {
        executionProviders: ["wasm"],
      });
      activeProvider = "wasm";
      graphCaptureActive = false;
      self.postMessage({ type: "LOG", data: "Model loaded (WASM fallback)" });
    }
  }
  return session;
}

async function ensureGpuPipeline(device: GPUDevice): Promise<GpuPipeline> {
  if (gpu) return gpu;
  if (gpuInitPromise) return gpuInitPromise;

  gpuInitPromise = (async () => {
    self.postMessage({ type: "LOG", data: "Compiling shaders..." });
    const packModule = device.createShaderModule({ code: PACK_WGSL });
    const unpackModule = device.createShaderModule({ code: UNPACK_WGSL });

    const [packPipeline, unpackPipeline] = await Promise.all([
      device.createComputePipelineAsync({
        layout: "auto",
        compute: { module: packModule, entryPoint: "main" },
      }),
      device.createComputePipelineAsync({
        layout: "auto",
        compute: { module: unpackModule, entryPoint: "main" },
      }),
    ]);

    const usage = (globalThis as any).GPUBufferUsage;
    const packParamsBuffer = device.createBuffer({
      size: 32,
      usage: usage.UNIFORM | usage.COPY_DST,
    });
    const unpackParamsBuffer = device.createBuffer({
      size: 32,
      usage: usage.UNIFORM | usage.COPY_DST,
    });

    const pipeline: GpuPipeline = {
      device,
      packPipeline,
      unpackPipeline,
      packParamsBuffer,
      unpackParamsBuffer,
    };
    gpu = pipeline;
    return pipeline;
  })();

  return gpuInitPromise;
}

function ensureSizeResources(g: GpuPipeline, padW: number, padH: number) {
  const key = `${padW}x${padH}x${NATIVE_SCALE}`;
  if (
    sizeKey === key &&
    srcTexture &&
    outPackedBuffer &&
    stagingBuffer &&
    packBindGroup
  ) {
    return;
  }
  sizeKey = key;

  const textureUsage = (globalThis as any).GPUTextureUsage;
  const bufferUsage = (globalThis as any).GPUBufferUsage;

  const outW = padW * NATIVE_SCALE;
  const outH = padH * NATIVE_SCALE;

  srcTexture?.destroy();
  srcTexture = g.device.createTexture({
    size: [padW, padH],
    format: "rgba8unorm",
    usage:
      textureUsage.TEXTURE_BINDING |
      textureUsage.COPY_DST |
      textureUsage.RENDER_ATTACHMENT,
  });

  const packedByteSize = outW * outH * 4;
  outPackedBuffer?.destroy();
  outPackedBuffer = g.device.createBuffer({
    size: packedByteSize,
    usage: bufferUsage.STORAGE | bufferUsage.COPY_SRC,
  });

  stagingBuffer?.destroy();
  stagingBuffer = g.device.createBuffer({
    size: packedByteSize,
    usage: bufferUsage.COPY_DST | bufferUsage.MAP_READ,
  });

  // Buffer đầu vào (Y channel only, float32)
  inputGpuBuffer?.destroy();
  inputGpuBuffer = g.device.createBuffer({
    size: padW * padH * 4,
    usage: bufferUsage.STORAGE | bufferUsage.COPY_DST | bufferUsage.COPY_SRC,
  });

  packBindGroup = g.device.createBindGroup({
    layout: g.packPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: srcTexture.createView() },
      { binding: 1, resource: { buffer: inputGpuBuffer } },
      { binding: 2, resource: { buffer: g.packParamsBuffer } },
    ],
  });
}

function getFrameSize(source: CanvasImageSource): {
  width: number;
  height: number;
} {
  if ("displayWidth" in source) {
    return {
      width: (source as VideoFrame).displayWidth,
      height: (source as VideoFrame).displayHeight,
    };
  }
  return { width: source.width as number, height: source.height as number };
}

async function processFrame(
  sample: VideoSample,
  scaleFactor: number,
): Promise<OffscreenCanvas> {
  const frameT0 = performance.now();
  const sess = await loadModel(NATIVE_SCALE);
  const inputName = sess.inputNames[0];

  const source = sample.toCanvasImageSource();
  const { width, height } = getFrameSize(source);

  let procSource: CanvasImageSource = source;
  let procW = width;
  let procH = height;

  const padW = Math.ceil(procW / 16) * 16;
  const padH = Math.ceil(procH / 16) * 16;
  const outW = padW * NATIVE_SCALE;
  const outH = padH * NATIVE_SCALE;

  const device = (env as any).webgpu?.device as GPUDevice | undefined;

  if (!outCanvas || outCanvas.width !== outW || outCanvas.height !== outH) {
    outCanvas = new OffscreenCanvas(outW, outH);
    outCtx = outCanvas.getContext("2d")!;
  }

  let modelScale = NATIVE_SCALE;

  if (device && activeProvider === "webgpu") {
    const g = await ensureGpuPipeline(device);
    ensureSizeResources(g, padW, padH);

    // Upload frame gốc vào GPU texture (1 lần duy nhất)
    device.queue.copyExternalImageToTexture(
      { source: procSource },
      { texture: srcTexture! },
      [procW, procH],
    );

    // Pack: RGBA8 texture → Y channel float32 buffer
    const packParams = new Uint32Array(8);
    packParams[0] = 0; // tileX
    packParams[1] = 0; // tileY
    packParams[2] = procW;
    packParams[3] = procH;
    packParams[4] = 0; // batchSlot
    packParams[5] = padW;
    packParams[6] = padH;
    device.queue.writeBuffer(g.packParamsBuffer, 0, packParams);

    let encoder = device.createCommandEncoder();
    let pass = encoder.beginComputePass();
    pass.setPipeline(g.packPipeline);
    pass.setBindGroup(0, packBindGroup!);
    pass.dispatchWorkgroups(padW / 16, padH / 16);
    pass.end();
    device.queue.submit([encoder.finish()]);

    // Inference
    const inputTensor = Tensor.fromGpuBuffer(inputGpuBuffer!, {
      dataType: "float32",
      dims: [1, 1, padH, padW],
    });

    const feeds: Record<string, Tensor> = { [inputName]: inputTensor };

    const inferT0 = performance.now();
    const results = await sess.run(feeds);
    const inferT1 = performance.now();

    const outputTensor = results[sess.outputNames[0]];

    // Xử lý fallback GPU -> CPU -> GPU bắt buộc của FSRCNN
    let outGpuBuffer: GPUBuffer;
    let isOwnBuffer = false;
    let ortGpuBuffer: GPUBuffer | undefined;

    try {
      ortGpuBuffer = (outputTensor as any).gpuBuffer as GPUBuffer;
    } catch (e) {
      // Bỏ qua lỗi nếu tensor đang nằm trên CPU (getter sẽ ném lỗi "not stored as a WebGPU buffer")
    }

    if (ortGpuBuffer) {
      outGpuBuffer = ortGpuBuffer;
    } else {
      // Fallback: download CPU rồi upload lại GPU
      const outputData = (await outputTensor.getData()) as Float32Array;
      const bufUsage = (globalThis as any).GPUBufferUsage;
      outGpuBuffer = device.createBuffer({
        size: outputData.byteLength,
        usage: bufUsage.STORAGE | bufUsage.COPY_DST | bufUsage.COPY_SRC,
      });
      device.queue.writeBuffer(outGpuBuffer, 0, outputData);
      isOwnBuffer = true;
    }

    // Đọc actual output dims từ tensor (FSRCNN có thể output khác với input * NATIVE_SCALE)
    const modelOutH = outputTensor.dims[2];
    const modelOutW = outputTensor.dims[3];

    // Unpack: Y (model output) + Cb/Cr (source texture) → RGBA8 packed
    // Dùng actual model output dims, KHÔNG dùng outW/outH (có thể khác)
    const actualOutW = Math.ceil(modelOutW / 16) * 16 || modelOutW;
    const actualOutH = Math.ceil(modelOutH / 16) * 16 || modelOutH;
    modelScale = Math.round(modelOutW / padW);

    const tileUnpackBindGroup = device.createBindGroup({
      layout: g.unpackPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: outGpuBuffer } },
        { binding: 1, resource: srcTexture!.createView() },
        { binding: 2, resource: { buffer: outPackedBuffer! } },
        { binding: 3, resource: { buffer: g.unpackParamsBuffer } },
      ],
    });

    const unpackParams = new Uint32Array(8);
    unpackParams[0] = 0; // dstX
    unpackParams[1] = 0; // dstY
    unpackParams[2] = outW; // dstStride (output canvas stride)
    unpackParams[3] = 0; // batchSlot
    unpackParams[4] = modelOutW; // outPadW (actual model output width)
    unpackParams[5] = modelOutH; // outPadH (actual model output height)
    unpackParams[6] = modelScale; // actual scale from model
    device.queue.writeBuffer(g.unpackParamsBuffer, 0, unpackParams);

    encoder = device.createCommandEncoder();
    pass = encoder.beginComputePass();
    pass.setPipeline(g.unpackPipeline);
    pass.setBindGroup(0, tileUnpackBindGroup);
    pass.dispatchWorkgroups(
      Math.ceil(modelOutW / 16),
      Math.ceil(modelOutH / 16),
    );
    pass.end();
    device.queue.submit([encoder.finish()]);

    // Dispose tensors
    inputTensor.dispose();
    outputTensor.dispose();
    if (isOwnBuffer) outGpuBuffer.destroy();

    const tileT1 = performance.now();
    perfTiles++;
    perfInferenceMs += inferT1 - inferT0;
    perfOtherMs += tileT1 - inferT0 - (inferT1 - inferT0);

    // Readback: copy kết quả từ GPU → staging buffer → CPU (1 lần duy nhất per frame)
    const mapMode = (globalThis as any).GPUMapMode;
    const readbackT0 = performance.now();
    {
      const encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(
        outPackedBuffer!,
        0,
        stagingBuffer!,
        0,
        outPackedBuffer!.size,
      );
      device.queue.submit([encoder.finish()]);
    }
    await device.queue.onSubmittedWorkDone();
    const workDoneT1 = performance.now();

    await stagingBuffer!.mapAsync(mapMode.READ);
    const mapT1 = performance.now();

    const packedBytes = new Uint8ClampedArray(
      stagingBuffer!.getMappedRange().slice(0),
    );
    stagingBuffer!.unmap();

    perfReadbackWorkDoneMs += workDoneT1 - readbackT0;
    perfReadbackMapMs += mapT1 - workDoneT1;
    perfReadbackMs += performance.now() - readbackT0;

    outCtx!.putImageData(new ImageData(packedBytes, outW, outH), 0, 0);

    perfFrames++;
    if (perfFrames === 1 || perfFrames % 15 === 0) {
      self.postMessage({
        type: "LOG",
        data:
          `[perf/${activeProvider}${graphCaptureActive ? "+gc" : ""}] frame ${perfFrames}: ` +
          `avg sess.run()=${(perfInferenceMs / perfTiles).toFixed(2)}ms/tile, ` +
          `avg other-per-tile=${(perfOtherMs / perfTiles).toFixed(2)}ms/tile, ` +
          `avg readback=${(perfReadbackMs / perfFrames).toFixed(1)}ms/frame ` +
          `(workDone=${(perfReadbackWorkDoneMs / perfFrames).toFixed(1)}ms, map=${(perfReadbackMapMs / perfFrames).toFixed(1)}ms), ` +
          `total tiles so far=${perfTiles}`,
      });
    }
  } else {
    // ---- CPU fallback (giữ nguyên full-frame) ----
    if (!inCanvas || inCanvas.width !== padW || inCanvas.height !== padH) {
      inCanvas = new OffscreenCanvas(padW, padH);
      inCtx = inCanvas.getContext("2d", { willReadFrequently: true })!;
    }
    inCtx!.clearRect(0, 0, padW, padH);
    inCtx!.drawImage(procSource, 0, 0);

    const fullIn = inCtx!.getImageData(0, 0, padW, padH);
    const inData = fullIn.data;

    const outBufLen = outW * outH * 4;
    if (!cpuOutBuffer || cpuOutBuffer.length !== outBufLen) {
      cpuOutBuffer = new Uint8ClampedArray(outBufLen);
    }

    const len = padW * padH;
    const outLen = outW * outH;
    if (floatData.length !== len) {
      floatData = new Float32Array(len);
    }

    const tileT0 = performance.now();
    for (let ry = 0; ry < padH; ry++) {
      const srcRowStart = ry * padW * 4;
      const dstRowStart = ry * padW;
      for (let rx = 0; rx < padW; rx++) {
        const s = srcRowStart + rx * 4;
        const d = dstRowStart + rx;
        const r = inData[s] / 255;
        const g = inData[s + 1] / 255;
        const b = inData[s + 2] / 255;
        floatData[d] = 0.299 * r + 0.587 * g + 0.114 * b;
      }
    }

    const inputTensor = new Tensor("float32", floatData, [1, 1, padH, padW]);
    const feeds: Record<string, Tensor> = { [inputName]: inputTensor };

    const inferT0 = performance.now();
    const results = await sess.run(feeds);
    const inferT1 = performance.now();

    const outputTensor = results[sess.outputNames[0]];
    const outData = outputTensor.data as Float32Array;

    const modelOutH = outputTensor.dims[2];
    const modelOutW = outputTensor.dims[3];
    modelScale = Math.round(modelOutW / padW);

    if (
      !bilinearCanvas ||
      bilinearCanvas.width !== modelOutW ||
      bilinearCanvas.height !== modelOutH
    ) {
      bilinearCanvas = new OffscreenCanvas(modelOutW, modelOutH);
      bilinearCtx = bilinearCanvas.getContext("2d")!;
    }
    bilinearCtx!.imageSmoothingEnabled = true;
    bilinearCtx!.imageSmoothingQuality = "high";
    bilinearCtx!.drawImage(
      procSource as any,
      0,
      0,
      procW,
      procH,
      0,
      0,
      modelOutW,
      modelOutH,
    );

    const bilinearData = bilinearCtx!.getImageData(0, 0, modelOutW, modelOutH).data;

    for (let ry = 0; ry < modelOutH; ry++) {
      const dstRowStart = ry * outW * 4;
      const srcRowStart = ry * modelOutW;
      for (let rx = 0; rx < modelOutW; rx++) {
        const d = dstRowStart + rx * 4;
        const si = srcRowStart + rx;
        const new_y = outData[si];

        const r_bilinear = bilinearData[d] / 255;
        const g_bilinear = bilinearData[d + 1] / 255;
        const b_bilinear = bilinearData[d + 2] / 255;

        const u =
          -0.14713 * r_bilinear - 0.28886 * g_bilinear + 0.436 * b_bilinear;
        const v =
          0.615 * r_bilinear - 0.51499 * g_bilinear - 0.10001 * b_bilinear;

        let r = new_y + 1.13983 * v;
        let g = new_y - 0.39465 * u - 0.5806 * v;
        let b = new_y + 2.03211 * u;

        cpuOutBuffer[d] = r * 255;
        cpuOutBuffer[d + 1] = g * 255;
        cpuOutBuffer[d + 2] = b * 255;
        cpuOutBuffer[d + 3] = 255;
      }
    }

    const tileT1 = performance.now();
    perfTiles++;
    perfInferenceMs += inferT1 - inferT0;
    perfOtherMs += tileT1 - inferT0 - (inferT1 - inferT0);

    outCtx!.putImageData(new ImageData(cpuOutBuffer, outW, outH), 0, 0);

    perfFrames++;
    if (perfFrames === 1 || perfFrames % 15 === 0) {
      self.postMessage({
        type: "LOG",
        data:
          `[perf/${activeProvider}] frame ${perfFrames}: ` +
          `avg sess.run()=${(perfInferenceMs / perfTiles).toFixed(2)}ms/frame, ` +
          `avg other=${(perfOtherMs / perfTiles).toFixed(2)}ms/frame, total frames so far=${perfTiles}`,
      });
    }
  }

  // Crop padding và trả về đúng kích thước
  const finalActualW = width * scaleFactor;
  const finalActualH = height * scaleFactor;

  if (
    !finalCanvas ||
    finalCanvas.width !== finalActualW ||
    finalCanvas.height !== finalActualH
  ) {
    finalCanvas = new OffscreenCanvas(finalActualW, finalActualH);
    finalCtx = finalCanvas.getContext("2d")!;
  }
  finalCtx!.drawImage(
    outCanvas!,
    0,
    0,
    procW * modelScale,
    procH * modelScale,
    0,
    0,
    finalActualW,
    finalActualH,
  );

  perfFrameTotalMs += performance.now() - frameT0;
  if (perfFrames === 1 || perfFrames % 15 === 0) {
    self.postMessage({
      type: "LOG",
      data: `[perf/${activeProvider}${graphCaptureActive ? "+gc" : ""}] frame ${perfFrames}: avg TOTAL processFrame()=${(perfFrameTotalMs / perfFrames).toFixed(1)}ms/frame`,
    });
  }

  return finalCanvas!;
}

self.onmessage = async (e) => {
  const { type, data } = e.data;
  if (type === "START") {
    try {
      const { file, scale } = data;
      NATIVE_SCALE = scale; // 2, 3, hoặc 4
      self.postMessage({ type: "LOG", data: `Started upscaling ${scale}x...` });

      const outName =
        file.name.replace(/\.[^.]+$/, "") + `-upscaled-${scale}x.mp4`;

      const input = new Input({
        formats: ALL_FORMATS,
        source: new BlobSource(file),
      });
      const primaryVideoTrack = await input.getPrimaryVideoTrack();
      if (!primaryVideoTrack) {
        throw new Error("No video track found in file.");
      }

      const srcDisplayWidth = await primaryVideoTrack.getDisplayWidth();
      const srcDisplayHeight = await primaryVideoTrack.getDisplayHeight();

      const bufferTarget = new BufferTarget();
      const output = new Output({
        format: new Mp4OutputFormat(),
        target: bufferTarget,
      });

      const conversion = await Conversion.init({
        input,
        output,
        video: {
          codec: "avc",
          quality: new Quality("high"),
          process: async (sample: VideoSample) => {
            return await processFrame(sample, scale);
          },
          processedWidth: srcDisplayWidth * scale,
          processedHeight: srcDisplayHeight * scale,
        },
        audio: {
          codec: "aac",
          quality: new Quality("high"),
        },
      });

      if (!conversion.isValid) {
        const reasons = conversion.discardedTracks
          .map((t) => t.reason)
          .join(", ");
        throw new Error(
          `This file cannot be processed.${reasons ? ` (${reasons})` : ""}`,
        );
      }

      conversion.onProgress = (progress) => {
        self.postMessage({ type: "PROGRESS", data: progress });
      };

      await conversion.execute();

      if (!bufferTarget.buffer) {
        throw new Error("MediaBunny produced no output.");
      }

      const outBlob = new Blob([bufferTarget.buffer], { type: "video/mp4" });
      const blobUrl = URL.createObjectURL(outBlob);

      self.postMessage({
        type: "DONE",
        data: {
          blobUrl,
          outName,
          originalSize: file.size,
          newSize: outBlob.size,
        },
      });
    } catch (err: any) {
      console.error(err);
      self.postMessage({ type: "ERROR", error: err.message || String(err) });
    }
  }
};

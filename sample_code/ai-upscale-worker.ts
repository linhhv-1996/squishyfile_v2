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

let inputGpuBuffer: GPUBuffer | null = null;

let session: InferenceSession | null = null;

// ---------------------------------------------------------------------------------
// model_dynamic_sim.onnx re-export: same SRVGGNetCompact weights as the old
// Real-ESRGAN-General-x4v3.onnx (verified bit-identical output on a 128x128 crop),
// but with dynamic H/W input/output dims instead of a graph baked to exactly
// 128x128 -> 512x512. That removes the old hard tile-size ceiling, but we still
// tile deliberately (not run the whole frame in one shot) -- picking TILE_SIZE is a
// 3-way tradeoff, all three measured against actual resolutions this tool sees
// (720p/1080p/1440p/4K), not just eyeballed:
//
// 1. Dispatch overhead: each sess.run() launches ~70 GPU kernels regardless of tile
//    size (34 Conv + 33 PReLU + Resize + DepthToSpace + Add) -- a fixed cost that
//    dominated at the old 128px tile (measured ~400-560ms/tile on WebGPU). Bigger
//    tiles mean fewer sess.run() calls per frame, amortizing that cost over more
//    pixels: 1080p padded to 128px tiles = 135 tiles; at 384px it's only 15 (9x
//    fewer), at 512px it's 12 (11x fewer).
// 2. GPU memory: every one of the 32 body conv layers holds a [1,64,H,W] activation
//    buffer (num_feat=64, confirmed from the exported weight shapes) = 64 *
//    TILE_SIZE^2 * 4 bytes. 384 -> ~38MB, 512 -> ~67MB. Both fit under a
//    spec-default WebGPU maxStorageBufferBindingSize (128MB) with room to spare (we
//    also now request the adapter's real max via requiredLimits below, so this
//    mostly matters as a floor for low-end/mobile GPUs that can't grant much more).
// 3. Padding waste: TILE_SIZE that doesn't evenly divide the frame's dimensions pads
//    up to the next multiple, and every padded-in pixel is real inference cost for
//    zero output. This is where 512 falls down for the resolutions people actually
//    upload: 1080p (1920x1080) pads to 2048x1536 at 512px -- 51.7% wasted pixels --
//    vs. only 6.7% at 384px (1920x1080 -> 1920x1152, since 1920/384 is exact). 720p
//    is similar (384px: 28% waste / 8 tiles vs. 512px: 70.7% waste / 6 tiles -- 512
//    "wins" on tile count only by doing a lot of pointless extra work per tile).
//
// Net: 384 keeps ~80% of 512's dispatch-count win (9x vs 11x fewer tiles at 1080p)
// while roughly halving both the peak per-tile GPU buffer size and the padding
// waste at the resolutions this tool mostly sees -- better safety margin for the
// same reason it exists (item 2), for very little of the tile-count upside given up.
// Must stay a /16 multiple (WGSL workgroup_size(16,16) below has no partial-group
// handling). Re-measure with real perf-counter numbers (see LOG lines below) before
// changing.
const NATIVE_SCALE = 2; // Fixed at 2x for this model

// We no longer hardcode TILE_SIZE=384 or BATCH_SIZE=2.
// The new CARN model is lightweight enough that we can process the whole frame
// (padded to a multiple of 16) in a single pass.
const BATCH_SIZE = 1;
// Verified directly from the

// KNOWN GAP (not fixed in this pass): tiles are packed/unpacked with zero overlap, so
// each tile is convolved as if its edges were the frame edge (zero-padded), not real
// neighboring pixels. Measured against a single untiled inference on the same crop,
// this shows up as a real seam: mean abs error in a 16px band straddling a tile
// boundary was ~226x the interior's, with per-pixel spikes up to ~0.45 (of 1.0). Adding
// ~32px of read-overlap per tile (crop the padding back off after inference) made the
// tiled output BIT-IDENTICAL to the untiled reference in the same test -- the model's
// receptive field is fully covered by 32px of real context. Bigger tiles (this change)
// mean fewer seams per frame, but don't remove them. Left as a follow-up since it
// touches both the GPU pack/unpack shaders and the CPU fallback's tile loop, and needs
// care at true frame edges (no neighbor to read past the padding boundary there).

// ---------------------------------------------------------------------------------
// Lightweight perf counters, logged every 15 frames via the existing LOG channel
// (shows up in the browser console as "[Upscale Worker]: [perf] ..."). This exists so
// the next slowness report comes with real ms/tile numbers instead of another guess.
// `inferenceMs` is time spent inside `await sess.run()` -- because WebGPU processes
// submitted work in queue order, this number already includes the GPU catching up to
// our pack-shader dispatch plus the actual model compute, so it's the best single
// proxy for "how expensive is one tile, really". (With `preferredOutputLocation:
// 'gpu-buffer'`, this no longer also includes an output download to CPU -- see
// loadModel -- so a drop here vs. older logs partly reflects that too, not just
// graph capture.)
// `otherMs` is everything else per tile (writeBuffer calls, our own submits, JS glue).
// ---------------------------------------------------------------------------------
let perfFrames = 0;
let perfTiles = 0;
let perfInferenceMs = 0;
let perfOtherMs = 0;
let perfReadbackMs = 0;
// Split readback into two phases to find out WHERE the ~560ms/frame lives (round 6):
// `workDone` = GPU actually finishing the queued copyBufferToBuffer (should be tiny --
// it's a same-GPU buffer-to-buffer copy of the packed frame, not a real transfer bottleneck
// at these sizes). `mapWait` = time from the GPU already being done to mapAsync's promise
// actually resolving -- if THIS is where the time goes, it's not real work, it's some kind
// of scheduling/callback latency (known candidates: background/inactive tab throttling
// browsers apply to timers, or a Dawn/driver-specific mapAsync latency floor).
let perfReadbackWorkDoneMs = 0;
let perfReadbackMapMs = 0;
// Round 6 finding: with `preferredOutputLocation: 'gpu-buffer'` (round 5), sess.run()
// no longer force-syncs with the GPU per tile (nothing needs downloading to CPU
// anymore) -- it can return once commands are QUEUED, not once they're EXECUTED. That
// makes the per-tile sess.run() number measure something different than it used to
// (CPU-side dispatch time only, not real completion), while the once-per-frame
// `device.queue.onSubmittedWorkDone()` in the readback step becomes the first place
// that actually waits for the GPU to finish -- meaning it now pays for ALL of that
// frame's deferred tile work in one lump sum instead of that cost being spread out
// (and correctly attributed) across the per-tile sess.run() awaits. Net effect: total
// real wall time per frame did NOT drop by the ~41x the raw sess.run() delta implied
// -- most of that "speedup" just moved to `workDone`. This wrapper timer measures the
// actual, honest total (call-to-return) per frame regardless of where internal sync
// points land, so future comparisons don't have to be reconstructed by hand from
// per-tile + readback numbers again.
let perfFrameTotalMs = 0;

// ---------------------------------------------------------------------------------
// CPU fallback path (used only when there's no WebGPU device at all, i.e. the model
// fell back to the 'wasm' execution provider). Slower, but correct everywhere.
// ---------------------------------------------------------------------------------
let floatData = new Float32Array(0); // Will be resized dynamically
let cpuOutBuffer: Uint8ClampedArray<ArrayBuffer> | null = null;

// ---------------------------------------------------------------------------------
// GPU fast path. Everything below is plain JS math replaced by two tiny compute
// shaders so the browser's GPU does the pixel format conversion in parallel instead
// of a JS `for` loop doing it one pixel at a time on a single CPU thread:
//   - packWGSL:  RGBA8 texture tile -> planar float32 buffer (model input)
//   - unpackWGSL: planar float32 model output -> packed RGBA8 bytes (written straight
//     into the correct spot of one big per-frame output buffer)
// The whole padded frame is uploaded to the GPU ONCE per frame via
// copyExternalImageToTexture (no getImageData/CPU pixel copy at all), and the whole
// frame's upscaled result is read back ONCE per frame (one mapAsync), instead of the
// old code's ~135 getImageData()/putImageData() calls per 1080p frame.
// The model's output tensor also now stays GPU-resident end to end (see
// `preferredOutputLocation: 'gpu-buffer'` in loadModel + `outputTensor.gpuBuffer`
// below) -- the unpack shader binds it directly instead of onnxruntime-web
// downloading it to CPU and us re-uploading it. Old behavior for reference: without
// that option, `sess.run()`'s await included ORT downloading the ~28MB tile output
// (3*1536*1536*4 bytes) to a Float32Array, which we then pushed straight back to the
// GPU via writeBuffer -- a 28MB-down + 28MB-up round trip per tile for data that
// never needed to leave the GPU at all.
// ---------------------------------------------------------------------------------

// PackParams grew a `batchSlot` field for round 8 (batching) -- WGSL uniform-address-
// space structs must be a multiple of 16 bytes, so 5 real u32 fields round up to 32
// bytes; padded to 8 u32 explicitly rather than relying on implicit layout rules, so
// the host-side Uint32Array (8 elements, see packParamsBuffer size below) can't
// silently disagree with the shader about where each field lands.
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
  let planeLen = params.padW * params.padH;
  let batchOffset = params.batchSlot * 3u * planeLen;
  outBuf[batchOffset + idx] = px.r;
  outBuf[batchOffset + planeLen + idx] = px.g;
  outBuf[batchOffset + 2u * planeLen + idx] = px.b;
}
`;

// UnpackParams: round 8 repurposes the pre-existing `_pad` field as `batchSlot` --
// struct was already exactly 16 bytes (4 u32) with a spare padding slot, so no size
// change needed here (unlike PackParams above).
const UNPACK_WGSL = /* wgsl */ `
struct UnpackParams {
  dstX: u32,
  dstY: u32,
  dstStride: u32,
  batchSlot: u32,
  outPadW: u32,
  outPadH: u32,
  _pad1: u32,
  _pad2: u32,
};
@group(0) @binding(0) var<storage, read> modelOut: array<f32>;
@group(0) @binding(1) var<storage, read_write> outPacked: array<u32>;
@group(0) @binding(2) var<uniform> params: UnpackParams;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.outPadW || gid.y >= params.outPadH) {
    return;
  }
  let planeLen = params.outPadW * params.outPadH;
  let batchOffset = params.batchSlot * 3u * planeLen;
  let si = gid.y * params.outPadW + gid.x;
  let r = modelOut[batchOffset + si];
  let g = modelOut[batchOffset + planeLen + si];
  let b = modelOut[batchOffset + 2u * planeLen + si];
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

// Size-dependent GPU resources (depend on the padded frame's pixel dimensions, which
// are constant for a given video/scale but must be rebuilt if they ever change).
let srcTexture: GPUTexture | null = null;
let packBindGroup: GPUBindGroup | null = null;
let outPackedBuffer: GPUBuffer | null = null;
// NOTE: no persistent unpackBindGroup -- binding 0 of that bind group must point at
// the model's OWN output GPUBuffer for the current tile (`outputTensor.gpuBuffer`,
// see processFrame), and onnxruntime-web is not guaranteed to hand back the same
// buffer identity on every call, so that bind group is built fresh per tile instead
// (cheap: no shader compile, just a CPU-side layout binding).
let stagingBuffer: GPUBuffer | null = null;
let sizeKey = '';

// Canvas pools, shared by both paths.
let downCanvas: OffscreenCanvas | null = null; // half-res pre-pass for the 2x path, see below
let downCtx: OffscreenCanvasRenderingContext2D | null = null;
let inCanvas: OffscreenCanvas | null = null; // CPU path only
let inCtx: OffscreenCanvasRenderingContext2D | null = null;
let outCanvas: OffscreenCanvas | null = null;
let outCtx: OffscreenCanvasRenderingContext2D | null = null;
let finalCanvas: OffscreenCanvas | null = null;
let finalCtx: OffscreenCanvasRenderingContext2D | null = null;

/**
 * Which execution provider actually ended up running the model. `processFrame` uses
 * this (not just "is there a GPU device") to decide whether it's safe to feed the
 * model a GPU-buffer tensor (only valid when the session itself runs on WebGPU) or
 * whether it must build a plain CPU tensor (WASM EP).
 */
let activeProvider: 'webgpu' | 'wasm' | null = null;

/**
 * Whether the active WebGPU session got graph capture (see loadModel below).
 * Folded into the perf LOG tag so a before/after comparison in the console doesn't
 * need reading code -- just diff `[perf/webgpu]` vs `[perf/webgpu+gc]` runs.
 */
let graphCaptureActive = false;

async function loadModel() {
  if (!session) {
    // Try to initialize a WebGPU device regardless of which execution provider ends up
    // running the model itself -- our own pack/unpack compute shaders (pixel format
    // conversion, see below) use this device when available, independently of that
    // choice. Measured cost of that part: ~0.3ms/tile, not the bottleneck either way.
    if (navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        // requestDevice() with NO requiredLimits gets the WebGPU spec DEFAULT limits,
        // not the adapter's actual max -- and the default maxStorageBufferBindingSize /
        // maxBufferSize is only 128MiB. `outPackedBuffer`/`stagingBuffer` below are sized
        // to the WHOLE padded output frame (padW*4 x padH*4 x 4 bytes), which blows past
        // 128MiB for anything 1080p+ (a plain 1920x1080 input already needs ~140-200MB
        // depending on TILE_SIZE padding) -- so without this, bind-group/buffer creation
        // would throw on exactly the resolutions people actually upscale. Ask for the
        // adapter's own max instead (still device-dependent; some mobile/integrated GPUs
        // report less than we'd want for very large frames -- if that ever gets hit in
        // practice, the real fix is to stop accumulating a whole-frame GPU buffer at all
        // and write each tile's readback out incrementally instead).
        const requiredLimits: Record<string, number> = {};
        if (adapter) {
          if (adapter.limits.maxStorageBufferBindingSize) {
            requiredLimits.maxStorageBufferBindingSize = adapter.limits.maxStorageBufferBindingSize;
          }
          if (adapter.limits.maxBufferSize) {
            requiredLimits.maxBufferSize = adapter.limits.maxBufferSize;
          }
        }
        // model_dynamic_sim_fp16.onnx is FLOAT16 end to end through the entire body
        // (verified directly from the graph: all 34 Conv + 33 PReLU + DepthToSpace +
        // Resize + Add run on float16 tensors, with a single Cast fp32->fp16 right
        // after the input and one Cast fp16->fp32 right before the output -- this is
        // NOT just fp16 storage with fp32 math). But WITHOUT explicitly requesting the
        // `shader-f16` WebGPU feature, WGSL has no native f16 type/arithmetic -- a
        // compute backend can still move f16-tagged data around (e.g. packed via
        // pack2x16float/unpack2x16float, which are core WGSL, no feature needed), but
        // any actual ALU work on it has to unpack to f32 first, so declaring the model
        // fp16 buys ~half the memory bandwidth for activations, NOT ~2x compute
        // throughput, unless this feature is actually granted. Request it when the
        // adapter offers it so onnxruntime-web's WebGPU EP can use real f16 ALU ops
        // for the Conv/PReLu kernels that are now the dominant real cost (see the
        // `workDone` finding in perfReadbackWorkDoneMs above) -- this is what could
        // realize a genuine ~2x on the GPU-bound path, not just fewer bytes moved.
        const requiredFeatures: GPUFeatureName[] = [];
        const f16Supported = !!adapter?.features.has('shader-f16');
        if (f16Supported) {
          requiredFeatures.push('shader-f16');
        }
        self.postMessage({
          type: 'LOG',
          data: `WebGPU adapter shader-f16 support: ${f16Supported ? 'YES (requesting it)' : 'NO (fp16 model will run via f32 ALU under the hood)'}`
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

    // The old measurement (~400-560ms/tile on WebGPU, WASM winning) was taken at the
    // 128x128 tile size, where the WebGPU EP's large FIXED per-operator dispatch cost
    // (this model issues ~70 GPU kernel launches per sess.run() -- 34 Conv + 33 PReLU +
    // Resize + DepthToSpace + Add) dwarfed the actual compute, since a 128x128 tile is
    // tiny. At TILE_SIZE=384 each of those ~70 launches does 9x more work per call, so
    // that fixed cost is amortized far more -- WebGPU should be back in play.
    //
    // Real in-browser numbers at 384px confirmed this is STILL dispatch-bound, not
    // compute-bound: sess.run() only dropped from ~400-560ms/tile (128px) to
    // ~305-333ms/tile (384px) despite each tile now doing 9x more work -- if compute
    // dominated, that ratio would have moved a lot more. 305ms / ~70 kernel launches
    // is ~4.3ms/launch, roughly constant regardless of tile size -- exactly what fixed
    // per-dispatch overhead looks like. Two things attack that overhead directly:
    //
    // 1. `enableGraphCapture`: records the ~70-kernel command sequence once (first
    //    run) and replays it on every later call instead of re-encoding + re-submitting
    //    each op from JS every tile. Requires the graph to have static shapes and every
    //    op to run on the same EP -- both true here (every tile is always exactly
    //    [1,3,TILE_SIZE,TILE_SIZE], see the pack shader) -- but per ORT's own docs this
    //    can also just fail at session-creation time if the model isn't a fit (this
    //    model was exported with dynamic H/W dims, which may or may not disqualify it --
    //    untested from here). Caught below and downgraded to a plain WebGPU session
    //    rather than treated as fatal.
    // 2. `preferredOutputLocation: 'gpu-buffer'`: without this, `sess.run()`'s await
    //    already includes ORT downloading the tile's ~28MB output tensor
    //    (3 * 1536 * 1536 * 4 bytes) to CPU as a Float32Array, which processFrame then
    //    immediately re-uploads to the GPU via writeBuffer for the unpack shader -- a
    //    full 28MB down + 28MB up round trip per tile for data that never needed to
    //    leave the GPU. This keeps the output as a live GPUBuffer (`outputTensor.gpuBuffer`)
    //    that the unpack shader binds directly; see processFrame.
    //
    // NOT re-verified against real GPU hardware from here (no browser/GPU in this
    // sandbox) -- the perf-counter LOG lines below now tag which config actually ended
    // up active (`[perf/webgpu+gc]` vs `[perf/webgpu]`) specifically so this can be
    // checked against real before/after numbers in-browser. If sess.run() times don't
    // move, or worse, frames come out visibly corrupted (stale/garbage tile content),
    // that points at the gpu-buffer output path specifically -- see the comment on
    // `outputTensor.gpuBuffer` usage in processFrame for the likely culprit.
    try {
      self.postMessage({ type: 'LOG', data: 'Loading ONNX model (WebGPU, graph capture)...' });
      session = await InferenceSession.create('/ai/espcn_dynamic.onnx', {
        executionProviders: ['webgpu'],
        enableGraphCapture: true,
        preferredOutputLocation: 'gpu-buffer'
      });
      activeProvider = 'webgpu';
      graphCaptureActive = true;
      self.postMessage({ type: 'LOG', data: 'Model loaded successfully (WebGPU, graph capture on)!' });
    } catch (gcErr: any) {
      console.warn('WebGPU graph capture unavailable for this model, retrying without it.', gcErr);
      try {
        self.postMessage({ type: 'LOG', data: 'Graph capture unavailable, loading WebGPU without it...' });
        session = await InferenceSession.create('/ai/espcn_dynamic.onnx', {
          executionProviders: ['webgpu'],
          preferredOutputLocation: 'gpu-buffer'
        });
        activeProvider = 'webgpu';
        graphCaptureActive = false;
        self.postMessage({ type: 'LOG', data: 'Model loaded successfully (WebGPU)!' });
      } catch (err: any) {
        console.warn('WebGPU EP failed to load, falling back to WASM.', err);
        self.postMessage({ type: 'LOG', data: 'WebGPU failed, falling back to WASM.' });
        session = await InferenceSession.create('/ai/espcn_dynamic.onnx', {
          executionProviders: ['wasm']
        });
        activeProvider = 'wasm';
        graphCaptureActive = false;
        self.postMessage({ type: 'LOG', data: 'Model loaded successfully (WASM)!' });
      }
    }
  }
  return session;
}

async function ensureGpuPipeline(device: GPUDevice): Promise<GpuPipeline> {
  if (gpu) return gpu;
  if (gpuInitPromise) return gpuInitPromise;

  gpuInitPromise = (async () => {
    self.postMessage({ type: 'LOG', data: 'Compiling upscale compute shaders...' });

    const packModule = device.createShaderModule({ code: PACK_WGSL });
    const unpackModule = device.createShaderModule({ code: UNPACK_WGSL });

    const [packPipeline, unpackPipeline] = await Promise.all([
      device.createComputePipelineAsync({ layout: 'auto', compute: { module: packModule, entryPoint: 'main' } }),
      device.createComputePipelineAsync({ layout: 'auto', compute: { module: unpackModule, entryPoint: 'main' } })
    ]);

    const usage = (globalThis as any).GPUBufferUsage;

    const packParamsBuffer = device.createBuffer({
      size: 32, // 8 x u32 -- see the PackParams WGSL struct comment above
      usage: usage.UNIFORM | usage.COPY_DST
    });
    const unpackParamsBuffer = device.createBuffer({
      size: 32, // 8 x u32
      usage: usage.UNIFORM | usage.COPY_DST
    });

    const pipeline: GpuPipeline = {
      device,
      packPipeline,
      unpackPipeline,
      packParamsBuffer,
      unpackParamsBuffer
    };
    gpu = pipeline;
    return pipeline;
  })();

  return gpuInitPromise;
}

/** (Re)creates the GPU resources that depend on the padded frame's pixel size. */
function ensureSizeResources(g: GpuPipeline, padW: number, padH: number) {
  const key = `${padW}x${padH}`;
  if (sizeKey === key && srcTexture && outPackedBuffer && stagingBuffer && packBindGroup) {
    return;
  }
  sizeKey = key;

  const textureUsage = (globalThis as any).GPUTextureUsage;
  const bufferUsage = (globalThis as any).GPUBufferUsage;

  srcTexture?.destroy();
  srcTexture = g.device.createTexture({
    size: [padW, padH],
    format: 'rgba8unorm',
    // COPY_DST + RENDER_ATTACHMENT is what copyExternalImageToTexture requires as a
    // destination, per the WebGPU spec (some implementations copy via an internal
    // blit path).
    usage: textureUsage.TEXTURE_BINDING | textureUsage.COPY_DST | textureUsage.RENDER_ATTACHMENT
  });

  const outW = padW * NATIVE_SCALE;
  const outH = padH * NATIVE_SCALE;
  const packedByteSize = outW * outH * 4;

  outPackedBuffer?.destroy();
  outPackedBuffer = g.device.createBuffer({
    size: packedByteSize,
    usage: bufferUsage.STORAGE | bufferUsage.COPY_SRC
  });

  stagingBuffer?.destroy();
  stagingBuffer = g.device.createBuffer({
    size: packedByteSize,
    usage: bufferUsage.COPY_DST | bufferUsage.MAP_READ
  });

  inputGpuBuffer?.destroy();
  inputGpuBuffer = g.device.createBuffer({
    size: 3 * padW * padH * 4 * BATCH_SIZE,
    usage: bufferUsage.STORAGE | bufferUsage.COPY_DST | bufferUsage.COPY_SRC
  });

  packBindGroup = g.device.createBindGroup({
    layout: g.packPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: srcTexture.createView() },
      { binding: 1, resource: { buffer: inputGpuBuffer } },
      { binding: 2, resource: { buffer: g.packParamsBuffer } }
    ]
  });
  // unpackBindGroup is intentionally NOT built here -- see the module-level comment
  // above `stagingBuffer`. It's rebuilt per tile in processFrame once the model's
  // output GPUBuffer for that tile is known.
}

function getFrameSize(source: CanvasImageSource): { width: number; height: number } {
  if ('displayWidth' in source) {
    return { width: (source as VideoFrame).displayWidth, height: (source as VideoFrame).displayHeight };
  }
  return { width: source.width as number, height: source.height as number };
}

/**
 * Runs one video frame through the tiled Real-ESRGAN model and returns a canvas
 * scaled to `width*scaleFactor x height*scaleFactor`.
 *
 * For `scaleFactor === 2` we first downsize the source frame to half resolution and
 * run the SAME fixed 4x model on that instead of running full-cost 4x inference and
 * then shrinking the result back down. The model's cost is dominated by the number of
 * TILE_SIZE x TILE_SIZE tiles it has to run, which scales with input area -- halving
 * each dimension first cuts the tile/inference count to roughly a quarter, so picking
 * "2x" in the UI is actually faster than "4x" again, not identical to it.
 */
async function processFrame(sample: VideoSample, scaleFactor: number): Promise<OffscreenCanvas> {
  const frameT0 = performance.now();
  const sess = await loadModel();
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
    outCtx = outCanvas.getContext('2d')!;
  }

  if (device && activeProvider === 'webgpu') {
    const g = await ensureGpuPipeline(device);
    ensureSizeResources(g, padW, padH);

    device.queue.copyExternalImageToTexture({ source: procSource }, { texture: srcTexture! }, [procW, procH]);

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

    const inputTensor = Tensor.fromGpuBuffer(inputGpuBuffer!, {
      dataType: 'float32',
      dims: [3, 1, padH, padW]
    });
    
    const feeds: Record<string, Tensor> = { [inputName]: inputTensor };
    const inferT0 = performance.now();
    const results = await sess.run(feeds);
    const inferT1 = performance.now();
    const outputTensor = results[sess.outputNames[0]];
    const outGpuBuffer = outputTensor.gpuBuffer as GPUBuffer;

    const tileUnpackBindGroup = device.createBindGroup({
      layout: g.unpackPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: outGpuBuffer } },
        { binding: 1, resource: { buffer: outPackedBuffer! } },
        { binding: 2, resource: { buffer: g.unpackParamsBuffer } }
      ]
    });

    const unpackParams = new Uint32Array(8);
    unpackParams[0] = 0; // dstX
    unpackParams[1] = 0; // dstY
    unpackParams[2] = outW; // dstStride
    unpackParams[3] = 0; // batchSlot
    unpackParams[4] = outW; // outPadW
    unpackParams[5] = outH; // outPadH
    
    device.queue.writeBuffer(g.unpackParamsBuffer, 0, unpackParams);
    
    encoder = device.createCommandEncoder();
    pass = encoder.beginComputePass();
    pass.setPipeline(g.unpackPipeline);
    pass.setBindGroup(0, tileUnpackBindGroup);
    pass.dispatchWorkgroups(outW / 16, outH / 16);
    pass.end();
    device.queue.submit([encoder.finish()]);

    inputTensor.dispose();
    outputTensor.dispose();

    const tileT1 = performance.now();
    perfTiles += 1;
    perfInferenceMs += inferT1 - inferT0;
    perfOtherMs += tileT1 - inferT0 - (inferT1 - inferT0);

    // One whole-frame readback instead of one per tile.
    const mapMode = (globalThis as any).GPUMapMode;
    const readbackT0 = performance.now();
    {
      const encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(outPackedBuffer!, 0, stagingBuffer!, 0, outPackedBuffer!.size);
      device.queue.submit([encoder.finish()]);
    }
    // Phase 1: wait for the GPU to actually finish the queued work (the copy itself).
    await device.queue.onSubmittedWorkDone();
    const workDoneT1 = performance.now();
    // Phase 2: map the (already-GPU-complete) staging buffer for CPU read.
    await stagingBuffer!.mapAsync(mapMode.READ);
    const mapT1 = performance.now();
    const packedBytes = new Uint8ClampedArray(stagingBuffer!.getMappedRange().slice(0));
    stagingBuffer!.unmap();
    perfReadbackWorkDoneMs += workDoneT1 - readbackT0;
    perfReadbackMapMs += mapT1 - workDoneT1;
    perfReadbackMs += performance.now() - readbackT0;

    outCtx!.putImageData(new ImageData(packedBytes, outW, outH), 0, 0);

    perfFrames++;
    if (perfFrames === 1 || perfFrames % 15 === 0) {
      self.postMessage({
        type: 'LOG',
        data:
          `[perf/${activeProvider}${graphCaptureActive ? '+gc' : ''}] frame ${perfFrames}: avg sess.run()=${(perfInferenceMs / perfTiles).toFixed(2)}ms/tile, ` +
          `avg other-per-tile=${(perfOtherMs / perfTiles).toFixed(2)}ms/tile, ` +
          `avg readback=${(perfReadbackMs / perfFrames).toFixed(1)}ms/frame ` +
          `(workDone=${(perfReadbackWorkDoneMs / perfFrames).toFixed(1)}ms, map=${(perfReadbackMapMs / perfFrames).toFixed(1)}ms), ` +
          `total tiles so far=${perfTiles}`
      });
    }
  } else {
    // ---- CPU/WASM path (also used when a WebGPU device exists but the MODEL itself
    // runs on the WASM execution provider -- see activeProvider above). ----
    if (!inCanvas || inCanvas.width !== padW || inCanvas.height !== padH) {
      inCanvas = new OffscreenCanvas(padW, padH);
      inCtx = inCanvas.getContext('2d', { willReadFrequently: true })!;
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
    
    if (floatData.length !== 3 * len) {
      floatData = new Float32Array(3 * len);
    }

    const tileT0 = performance.now();

    for (let ry = 0; ry < padH; ry++) {
      const srcRowStart = ry * padW * 4;
      const dstRowStart = ry * padW;
      for (let rx = 0; rx < padW; rx++) {
        const s = srcRowStart + rx * 4;
        const d = dstRowStart + rx;
        floatData[d] = inData[s] / 255;
        floatData[len + d] = inData[s + 1] / 255;
        floatData[2 * len + d] = inData[s + 2] / 255;
      }
    }

    const inputTensor = new Tensor('float32', floatData, [3, 1, padH, padW]);
    const feeds: Record<string, Tensor> = { [inputName]: inputTensor };
    const inferT0 = performance.now();
    const results = await sess.run(feeds);
    const inferT1 = performance.now();
    const outputTensor = results[sess.outputNames[0]];
    const outData = outputTensor.data as Float32Array;

    for (let ry = 0; ry < outH; ry++) {
      const dstRowStart = ry * outW * 4;
      const srcRowStart = ry * outW;
      for (let rx = 0; rx < outW; rx++) {
        const d = dstRowStart + rx * 4;
        const si = srcRowStart + rx;
        cpuOutBuffer[d] = outData[si] * 255;
        cpuOutBuffer[d + 1] = outData[outLen + si] * 255;
        cpuOutBuffer[d + 2] = outData[2 * outLen + si] * 255;
        cpuOutBuffer[d + 3] = 255;
      }
    }

    const tileT1 = performance.now();
    perfTiles++;
    perfInferenceMs += inferT1 - inferT0;
    perfOtherMs += tileT1 - tileT0 - (inferT1 - inferT0);

    outCtx!.putImageData(new ImageData(cpuOutBuffer, outW, outH), 0, 0);

    perfFrames++;
    if (perfFrames === 1 || perfFrames % 15 === 0) {
      self.postMessage({
        type: 'LOG',
        data:
          `[perf/${activeProvider}] frame ${perfFrames}: avg sess.run()=${(perfInferenceMs / perfTiles).toFixed(2)}ms/frame, ` +
          `avg other=${(perfOtherMs / perfTiles).toFixed(2)}ms/frame, total frames so far=${perfTiles}`
      });
    }
  }

  const finalActualW = width * scaleFactor;
  const finalActualH = height * scaleFactor;

  if (!finalCanvas || finalCanvas.width !== finalActualW || finalCanvas.height !== finalActualH) {
    finalCanvas = new OffscreenCanvas(finalActualW, finalActualH);
    finalCtx = finalCanvas.getContext('2d')!;
  }

  // Crop off the tile-alignment padding margin and land on the exact target size.
  finalCtx!.drawImage(outCanvas!, 0, 0, procW * NATIVE_SCALE, procH * NATIVE_SCALE, 0, 0, finalActualW, finalActualH);

  // Honest total call-to-return time for this frame, independent of where internal
  // GPU sync points happen to land (see perfFrameTotalMs comment above).
  perfFrameTotalMs += performance.now() - frameT0;
  if (perfFrames === 1 || perfFrames % 15 === 0) {
    self.postMessage({
      type: 'LOG',
      data: `[perf/${activeProvider}${graphCaptureActive ? '+gc' : ''}] frame ${perfFrames}: avg TOTAL processFrame()=${(perfFrameTotalMs / perfFrames).toFixed(1)}ms/frame`
    });
  }

  return finalCanvas!;
}

self.onmessage = async (e) => {
  const { type, data } = e.data;

  if (type === 'START') {
    try {
      const { file, scale } = data;
      const scaleFactor = scale === 2 ? 2 : 4;

      self.postMessage({ type: 'LOG', data: `Started upscaling ${scaleFactor}x...` });

      const outName = file.name.replace(/\.[^.]+$/, '') + `-upscaled-${scaleFactor}x.mp4`;

      const input = new Input({
        formats: ALL_FORMATS,
        source: new BlobSource(file)
      });

      const primaryVideoTrack = await input.getPrimaryVideoTrack();
      if (!primaryVideoTrack) {
        throw new Error('No video track found in file.');
      }

      // Mediabunny needs to know the OUTPUT size of our process() callback up front
      // so it can configure the VideoEncoder with the right dimensions. Without this,
      // it assumes process() doesn't resize anything and configures the encoder for
      // the ORIGINAL (pre-upscale) size -- then every encode() call fails because the
      // frames we hand back are 2x/4x larger than what the encoder was told to expect.
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

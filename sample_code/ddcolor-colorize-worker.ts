import { env, InferenceSession, Tensor } from 'onnxruntime-web/webgpu';
import { setupWasmCache } from './ort-wasm-cache';

setupWasmCache();
env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/';

// ---------------------------------------------------------------------------------
// DDColor-tiny (fp16 weights, float32 I/O) -- fixed 512x512 input.
//
// Design mirrors the official DDColor inference pipeline (piddnad/DDColor):
// the network never sees your real photo at full resolution. Instead:
//   1. The original image is resized (not padded -- plain squash resize, same
//      as the reference implementation) down to 512x512 and converted to a
//      "gray RGB" image: only the CIE L* (lightness) channel is kept, then
//      converted back to RGB so the network gets a 3-channel achromatic image.
//   2. The model predicts the Lab a*/b* (color) channels at 512x512.
//   3. Those predicted a*/b* planes are upsampled with a proper float
//      bilinear resize back to the ORIGINAL image's width/height.
//   4. They're recombined with the ORIGINAL image's own full-resolution L*
//      channel (not the downscaled one) and converted back to RGB.
// This is why the output keeps full original detail/sharpness -- the AI only
// ever contributes color, never resolution. Any pre-existing color in the
// input is discarded on purpose (step 1 always starts from lightness only),
// so this also works as a "recolorize" pass on already-color photos.
// ---------------------------------------------------------------------------------

const MODEL_SIZE = 512;

let currentSession: InferenceSession | null = null;
let wasmForced = false;

async function fetchAndCacheModel(url: string): Promise<Uint8Array> {
  const cacheName = 'tapir-ai-models-v1';
  let cache: Cache | null = null;

  try {
    cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(url);
    if (cachedResponse) {
      self.postMessage({ type: 'LOG', data: `Model loaded from browser cache.` });
      const buffer = await cachedResponse.arrayBuffer();
      return new Uint8Array(buffer);
    }
  } catch (e) {
    console.warn('Cache API not available or failed', e);
  }

  self.postMessage({ type: 'LOG', data: `Downloading model from network...` });
  self.postMessage({ type: 'PHASE', data: 'downloading_model' });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download model: ${response.statusText}`);
  }

  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  if (!total || !response.body) {
    const buffer = await response.clone().arrayBuffer();
    if (cache) {
      try {
        await cache.put(url, response);
      } catch (e) {
        console.warn('Failed to cache model', e);
      }
    }
    return new Uint8Array(buffer);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    if (value) {
      chunks.push(value);
      receivedLength += value.length;
      self.postMessage({ type: 'PROGRESS', data: receivedLength / total });
    }
  }

  const chunksAll = new Uint8Array(receivedLength);
  let position = 0;
  for (const chunk of chunks) {
    chunksAll.set(chunk, position);
    position += chunk.length;
  }

  if (cache) {
    try {
      const cacheResponse = new Response(chunksAll, { headers: response.headers });
      await cache.put(url, cacheResponse);
    } catch (e) {
      console.warn('Failed to cache model', e);
    }
  }

  return chunksAll;
}

async function loadModel(forceWasm: boolean = false) {
  if (currentSession && !forceWasm) {
    return currentSession;
  }

  if (currentSession) {
    try {
      await currentSession.release();
    } catch (e) {
      // Ignore -- we're discarding this session either way.
    }
    currentSession = null;
  }

  const modelUrl = `https://huggingface.co/buckets/hvlinhtptn/ai_model/resolve/ddcolor-tiny-fp16.onnx?download=true`;

  if (!forceWasm && (navigator as any).gpu) {
    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      const requiredLimits: Record<string, number> = {};
      if (adapter) {
        if (adapter.limits.maxStorageBufferBindingSize)
          requiredLimits.maxStorageBufferBindingSize = adapter.limits.maxStorageBufferBindingSize;
        if (adapter.limits.maxBufferSize)
          requiredLimits.maxBufferSize = adapter.limits.maxBufferSize;
      }
      const device = await adapter?.requestDevice({ requiredLimits });
      if (device) {
        (env as any).webgpu = (env as any).webgpu || {};
        (env as any).webgpu.device = device;
      }
    } catch (err) {
      console.warn('WebGPU device init failed:', err);
    }
  }

  const providers = forceWasm ? ['wasm'] : [{ name: 'webgpu', preferredLayout: 'NCHW' }, 'wasm'];

  try {
    self.postMessage({ type: 'LOG', data: `Loading DDColor model (${forceWasm ? 'WASM' : 'WebGPU'})...` });
    const modelData = await fetchAndCacheModel(modelUrl);
    currentSession = await InferenceSession.create(modelData, {
      executionProviders: providers,
      // The model's pe_layer/color_decoder/Tile position-embedding nodes
      // depend on the input's runtime shape and can't be constant-folded
      // (see the "Could not find a CPU kernel and hence can't constant
      // fold" warnings at session creation) -- a partially-folded dynamic
      // graph is a known source of downstream shape bugs at Run() time, so
      // skip graph optimization entirely rather than risk it.
      graphOptimizationLevel: 'disabled'
    });

    try {
      self.postMessage({ type: 'LOG', data: `Input names: ${JSON.stringify(currentSession.inputNames)}` });
      self.postMessage({ type: 'LOG', data: `Output names: ${JSON.stringify(currentSession.outputNames)}` });
      const inMeta = (currentSession as any).inputMetadata;
      const outMeta = (currentSession as any).outputMetadata;
      if (inMeta) self.postMessage({ type: 'LOG', data: `Input metadata: ${JSON.stringify(inMeta)}` });
      if (outMeta) self.postMessage({ type: 'LOG', data: `Output metadata: ${JSON.stringify(outMeta)}` });
    } catch (metaErr) {
      self.postMessage({ type: 'LOG', data: `Could not read session metadata: ${metaErr}` });
    }
  } catch (err) {
    console.warn(`Failed to load DDColor model.`, err);
    self.postMessage({ type: 'LOG', data: `Failed to load model.` });
    throw err;
  }
  return currentSession;
}

async function fallbackToWasm(): Promise<InferenceSession> {
  self.postMessage({
    type: 'LOG',
    data: 'WebGPU inference failed at runtime -- falling back to WASM (CPU)...'
  });
  const sess = await loadModel(true);
  wasmForced = true;
  self.postMessage({ type: 'LOG', data: 'Model reloaded (WASM)!' });
  return sess;
}

// ---------------------------------------------------------------------------------
// sRGB <-> CIE L*a*b* (D65), matching OpenCV's float32 BGR2Lab / Lab2BGR path
// used by the reference DDColor implementation: L in [0, 100], a/b roughly
// [-127, 127] for natural images.
// ---------------------------------------------------------------------------------

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb255(c: number): number {
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  const v = s * 255;
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function labF(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

function labFInv(t: number): number {
  const t3 = t * t * t;
  return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
}

const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;

// Full-res original only needs L -- skip computing a/b (and the X/Z matrix
// rows) entirely for that pass, since it's the most pixel-heavy loop.
function rgbToL(r: number, g: number, b: number): number {
  const rl = srgbToLinear(r / 255);
  const gl = srgbToLinear(g / 255);
  const bl = srgbToLinear(b / 255);
  const Y = 0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl;
  return 116 * labF(Y / YN) - 16;
}

function rgbToLab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const rl = srgbToLinear(r / 255);
  const gl = srgbToLinear(g / 255);
  const bl = srgbToLinear(b / 255);
  const X = 0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl;
  const Y = 0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl;
  const Z = 0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl;
  const fx = labF(X / XN);
  const fy = labF(Y / YN);
  const fz = labF(Z / ZN);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

// Returns the R channel only (R === G === B for an achromatic a=0,b=0 color).
function lToGray255(L: number): number {
  const fy = (L + 16) / 116;
  const Y = YN * labFInv(fy);
  return linearToSrgb255(Y);
}

function labToRgb255(L: number, a: number, bb: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - bb / 200;
  const X = XN * labFInv(fx);
  const Y = YN * labFInv(fy);
  const Z = ZN * labFInv(fz);
  const rl = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const gl = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
  const bl = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  return [linearToSrgb255(rl), linearToSrgb255(gl), linearToSrgb255(bl)];
}

// Plain float bilinear resize of a planar (channel-major) buffer -- used for
// upsampling the model's predicted a*/b* planes back to full resolution
// without the precision loss an 8-bit round trip through canvas would cost.
function bilinearResizePlanar(
  src: Float32Array,
  channels: number,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Float32Array {
  const dst = new Float32Array(channels * dstW * dstH);
  const srcPlane = srcW * srcH;
  const dstPlane = dstW * dstH;
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;

  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(Math.max((y + 0.5) * scaleY - 0.5, 0), srcH - 1);
    const y0 = Math.floor(sy);
    const y1 = Math.min(y0 + 1, srcH - 1);
    const wy = sy - y0;

    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(Math.max((x + 0.5) * scaleX - 0.5, 0), srcW - 1);
      const x0 = Math.floor(sx);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const wx = sx - x0;

      const dIdx = y * dstW + x;
      for (let c = 0; c < channels; c++) {
        const base = c * srcPlane;
        const v00 = src[base + y0 * srcW + x0];
        const v01 = src[base + y0 * srcW + x1];
        const v10 = src[base + y1 * srcW + x0];
        const v11 = src[base + y1 * srcW + x1];
        const top = v00 + (v01 - v00) * wx;
        const bottom = v10 + (v11 - v10) * wx;
        dst[c * dstPlane + dIdx] = top + (bottom - top) * wy;
      }
    }
  }

  return dst;
}

self.onmessage = async (e) => {
  const { type, data } = e.data;

  if (type === 'START') {
    try {
      const { file } = data;

      self.postMessage({ type: 'PROGRESS', data: 0.05 });
      self.postMessage({ type: 'LOG', data: `Loading image...` });

      const imgBitmap = await createImageBitmap(file);
      const width = imgBitmap.width;
      const height = imgBitmap.height;

      // Full-resolution RGBA, used to pull out the original L* channel that
      // the final output is built on (the network never touches this data).
      const fullCanvas = new OffscreenCanvas(width, height);
      const fullCtx = fullCanvas.getContext('2d')!;
      fullCtx.drawImage(imgBitmap, 0, 0);
      const fullData = fullCtx.getImageData(0, 0, width, height).data;

      // 512x512 "gray RGB" input for the network -- plain squash resize (no
      // letterboxing), matching the reference DDColor preprocessing.
      const smallCanvas = new OffscreenCanvas(MODEL_SIZE, MODEL_SIZE);
      const smallCtx = smallCanvas.getContext('2d')!;
      smallCtx.imageSmoothingEnabled = true;
      smallCtx.imageSmoothingQuality = 'high';
      smallCtx.drawImage(imgBitmap, 0, 0, MODEL_SIZE, MODEL_SIZE);
      const smallData = smallCtx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data;
      imgBitmap.close();

      self.postMessage({ type: 'PROGRESS', data: 0.15 });
      self.postMessage({ type: 'LOG', data: `Computing original luminance...` });

      // Original full-res L* channel -- this is what the final colorized
      // image's detail/sharpness comes from.
      const pixelCount = width * height;
      const origL = new Float32Array(pixelCount);
      for (let i = 0; i < pixelCount; i++) {
        const s = i * 4;
        origL[i] = rgbToL(fullData[s], fullData[s + 1], fullData[s + 2]);
      }

      // Gray-RGB tensor for the network: NCHW [1, 3, 512, 512], values [0,1],
      // all three channels identical (achromatic).
      const modelLen = MODEL_SIZE * MODEL_SIZE;
      const inputFloat = new Float32Array(3 * modelLen);
      for (let i = 0; i < modelLen; i++) {
        const s = i * 4;
        const L = rgbToL(smallData[s], smallData[s + 1], smallData[s + 2]);
        const gray = lToGray255(L) / 255;
        inputFloat[i] = gray;
        inputFloat[modelLen + i] = gray;
        inputFloat[2 * modelLen + i] = gray;
      }

      self.postMessage({ type: 'PROGRESS', data: 0.3 });

      let sess = await loadModel(false);
      self.postMessage({ type: 'PHASE', data: 'colorizing' });
      self.postMessage({ type: 'LOG', data: `Running DDColor inference...` });

      const runInference = async (runSess: InferenceSession) => {
        const inputName = runSess.inputNames[0];
        const inputTensor = new Tensor('float32', inputFloat, [1, 3, MODEL_SIZE, MODEL_SIZE]);
        self.postMessage({ type: 'LOG', data: `Running with input '${inputName}' dims [${inputTensor.dims.join(', ')}]` });
        const results = await runSess.run({ [inputName]: inputTensor });
        const outputTensor = results[runSess.outputNames[0]];
        const outData = (await outputTensor.getData()) as Float32Array;
        const dims = outputTensor.dims as readonly number[];
        inputTensor.dispose();
        return { outData, dims };
      };

      let outData: Float32Array;
      let dims: readonly number[];

      try {
        ({ outData, dims } = await runInference(sess));
      } catch (runErr: any) {
        if (!wasmForced) {
          self.postMessage({
            type: 'LOG',
            data: `WebGPU inference threw an error: ${runErr.message}. Falling back to WASM...`
          });
          sess = await fallbackToWasm();
          ({ outData, dims } = await runInference(sess));
        } else {
          throw runErr;
        }
      }

      let hasNaN = false;
      let minOut = Infinity;
      let maxOut = -Infinity;
      for (let i = 0; i < outData.length; i++) {
        const v = outData[i];
        if (Number.isNaN(v)) hasNaN = true;
        if (v < minOut) minOut = v;
        if (v > maxOut) maxOut = v;
      }

      if (!wasmForced && (hasNaN || (minOut === 0 && maxOut === 0) || Math.abs(maxOut - minOut) < 0.0001)) {
        self.postMessage({
          type: 'LOG',
          data: `WebGPU silent failure detected (min=${minOut}, max=${maxOut}). Falling back to WASM...`
        });
        sess = await fallbackToWasm();
        ({ outData, dims } = await runInference(sess));
      }

      self.postMessage({ type: 'PROGRESS', data: 0.6 });
      self.postMessage({ type: 'LOG', data: `Inference done. Reconstructing full-resolution image...` });

      // dims is [1, C, H, W]. C === 2 means the model output raw a*/b*
      // directly (the expected DDColor export). C === 3 means it output a
      // full gray-to-RGB image at 512x512 instead -- derive a*/b* from that
      // via the same Lab conversion, so the rest of the pipeline (and the
      // full-resolution detail preservation) behaves identically either way.
      const outC = dims[1];
      const outH = dims[2];
      const outW = dims[3];
      const outLen = outH * outW;

      let ab512: Float32Array;
      if (outC === 2) {
        ab512 = outData;
      } else if (outC === 3) {
        ab512 = new Float32Array(2 * outLen);
        const isNormalized = maxOut <= 1.0001 && minOut >= -0.0001;
        for (let i = 0; i < outLen; i++) {
          let r = outData[i];
          let g = outData[outLen + i];
          let b = outData[2 * outLen + i];
          if (isNormalized) {
            r *= 255;
            g *= 255;
            b *= 255;
          }
          const lab = rgbToLab(r, g, b);
          ab512[i] = lab.a;
          ab512[outLen + i] = lab.b;
        }
      } else {
        throw new Error(`Unexpected DDColor output shape: [${dims.join(', ')}]`);
      }

      self.postMessage({ type: 'PROGRESS', data: 0.75 });

      // Upsample predicted a*/b* from model resolution to the ORIGINAL
      // image's width/height with a real float bilinear resize.
      const abFull = bilinearResizePlanar(ab512, 2, outW, outH, width, height);

      self.postMessage({ type: 'PROGRESS', data: 0.85 });
      self.postMessage({ type: 'LOG', data: `Compositing colorized output...` });

      const outBuffer = new Uint8ClampedArray(pixelCount * 4);
      for (let i = 0; i < pixelCount; i++) {
        const a = abFull[i];
        const b = abFull[pixelCount + i];
        const [r, g, bb] = labToRgb255(origL[i], a, b);
        const d = i * 4;
        outBuffer[d] = r;
        outBuffer[d + 1] = g;
        outBuffer[d + 2] = bb;
        outBuffer[d + 3] = 255;
      }

      self.postMessage({ type: 'PROGRESS', data: 0.97 });

      const outCanvas = new OffscreenCanvas(width, height);
      const outCtx = outCanvas.getContext('2d')!;
      outCtx.putImageData(new ImageData(outBuffer, width, height), 0, 0);
      const blob = await outCanvas.convertToBlob({ type: 'image/png' });
      const blobUrl = URL.createObjectURL(blob);

      const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      const outName = `${baseName}-colorized.png`;

      self.postMessage({
        type: 'DONE',
        data: {
          blobUrl,
          outName,
          originalSize: file.size,
          newSize: blob.size
        }
      });
    } catch (err: any) {
      self.postMessage({ type: 'ERROR', error: err.message || err.toString() });
    }
  }
};

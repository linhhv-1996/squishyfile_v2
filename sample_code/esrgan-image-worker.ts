import { env, InferenceSession, Tensor } from 'onnxruntime-web/webgpu';
import { setupWasmCache } from './ort-wasm-cache';

setupWasmCache();
env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/';

// ---------------------------------------------------------------------------------
// Tiling constants
// ---------------------------------------------------------------------------------
// Real-ESRGAN (RRDBNet, 23 blocks / 64ch) is much heavier per-pixel than the video
// upscaler's IMDN model. This worker used to run the WHOLE image through a single
// sess.run() call -- one giant GPU dispatch with zero progress feedback in between
// and no event-loop yield points in between. That's what made Firefox (whose
// WebGPU backend handles one huge compute-heavy submission worse than Chrome's
// Dawn) feel like it hung for the whole run, even though it did finish. Tiling
// fixes both problems: many small sess.run() calls give real per-tile progress
// and regular yields back to the event loop, and each dispatch is far smaller.
const TILE_SIZE = 256; // core output region per tile, pre-upscale pixels
const TILE_OVERLAP = 32; // extra context sampled around each tile and cropped off
// the output afterwards, to avoid seams at tile borders. RRDBNet's receptive field
// (23 sequential RRDB blocks, each several 3x3 convs) is considerably deeper than
// IMDN's (the video model, which still has a known zero-overlap seam gap) -- this
// value has NOT been visually verified against seam artifacts. Check tile
// boundaries (every 256px) in the output; bump this up if seams are visible.

let currentSessionScale = 0;
let currentSession: InferenceSession | null = null;
// Once true, WebGPU has already failed at runtime for this worker (this browser
// tab) and every subsequent job goes straight to WASM -- no point retrying a
// backend that's already proven broken.
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
      const cacheResponse = new Response(chunksAll, {
        headers: response.headers
      });
      await cache.put(url, cacheResponse);
    } catch (e) {
      console.warn('Failed to cache model', e);
    }
  }

  return chunksAll;
}

async function loadModel(scaleFactor: number, forceWasm: boolean = false) {
  if (currentSession && currentSessionScale === scaleFactor && !forceWasm) {
    return currentSession;
  }
  
  if (currentSession) {
    try {
      await currentSession.release();
    } catch (e) {
      // Ignore release errors -- we're discarding this session either way.
    }
    currentSession = null;
  }
  
  const modelUrl = scaleFactor === 2 
    ? `https://huggingface.co/buckets/hvlinhtptn/esrgan/resolve/RealESRGAN_x2plus.onnx?download=true` 
    : `https://huggingface.co/buckets/hvlinhtptn/esrgan/resolve/RealESRGAN_x4plus.onnx?download=true`;

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
    self.postMessage({ type: 'LOG', data: `Loading ESRGAN model ${scaleFactor}x (${forceWasm ? 'WASM' : 'WebGPU'})...` });
    const modelData = await fetchAndCacheModel(modelUrl);
    currentSession = await InferenceSession.create(modelData, {
      executionProviders: providers
    });
    currentSessionScale = scaleFactor;
  } catch (err) {
    console.warn(`Failed to load ${modelUrl}.`, err);
    self.postMessage({ type: 'LOG', data: `Failed to load model.` });
    throw err;
  }
  return currentSession;
}

async function fallbackToWasm(scaleFactor: number): Promise<InferenceSession> {
  self.postMessage({
    type: 'LOG',
    data: 'WebGPU inference failed at runtime -- falling back to WASM (CPU) for the rest of this image...'
  });
  const sess = await loadModel(scaleFactor, true);
  wasmForced = true;
  self.postMessage({ type: 'LOG', data: 'Model reloaded (WASM)!' });
  return sess;
}

// ---------------------------------------------------------------------------------
// Tiled upscaling
// ---------------------------------------------------------------------------------

// Builds one NCHW float32 buffer covering the whole (padded + overlap-extended)
// canvas, edge-replicating past the true image bounds on every side. Every tile's
// context window is then a plain sub-rectangle of this buffer -- no per-tile
// bounds clamping needed.
function packExtendedInput(
  imageData: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  extW: number,
  extH: number
): Float32Array {
  const len = extW * extH;
  const out = new Float32Array(3 * len);
  for (let ey = 0; ey < extH; ey++) {
    const cy = Math.min(Math.max(ey - TILE_OVERLAP, 0), srcH - 1);
    const rowBase = ey * extW;
    const srcRowBase = cy * srcW;
    for (let ex = 0; ex < extW; ex++) {
      const cx = Math.min(Math.max(ex - TILE_OVERLAP, 0), srcW - 1);
      const si = (srcRowBase + cx) * 4;
      const di = rowBase + ex;
      // Real-ESRGAN expects [0, 1] inputs
      out[di] = imageData[si] / 255.0;
      out[len + di] = imageData[si + 1] / 255.0;
      out[2 * len + di] = imageData[si + 2] / 255.0;
    }
  }
  return out;
}

self.onmessage = async (e) => {
  const { type, data } = e.data;

  if (type === 'START') {
    try {
      const { file, scale: requestedScale } = data; // requestedScale is 2 or 4
      const scaleFactor = requestedScale === 2 ? 2 : 4;

      self.postMessage({ type: 'PROGRESS', data: 0.05 });
      self.postMessage({ type: 'LOG', data: `Loading image...` });

      const imgBitmap = await createImageBitmap(file);
      const width = imgBitmap.width;
      const height = imgBitmap.height;

      const srcCanvas = new OffscreenCanvas(width, height);
      const srcCtx = srcCanvas.getContext('2d')!;
      srcCtx.drawImage(imgBitmap, 0, 0);
      imgBitmap.close();
      const imageData = srcCtx.getImageData(0, 0, width, height).data;

      const padW = Math.ceil(width / TILE_SIZE) * TILE_SIZE;
      const padH = Math.ceil(height / TILE_SIZE) * TILE_SIZE;
      const tilesX = padW / TILE_SIZE;
      const tilesY = padH / TILE_SIZE;
      const extW = padW + 2 * TILE_OVERLAP;
      const extH = padH + 2 * TILE_OVERLAP;
      const contextSize = TILE_SIZE + 2 * TILE_OVERLAP;

      const extended = packExtendedInput(imageData, width, height, extW, extH);

      self.postMessage({ type: 'PROGRESS', data: 0.15 });

      let sess = await loadModel(scaleFactor, false);
      self.postMessage({ type: 'PHASE', data: 'upscaling' });
      self.postMessage({
        type: 'LOG',
        data: `Upscaling in ${tilesX * tilesY} tiles (${TILE_SIZE}px core, ${TILE_OVERLAP}px overlap)...`
      });

      const runTiles = async (runSess: InferenceSession) => {
        const coreOutSize = TILE_SIZE * scaleFactor;
        const marginOut = TILE_OVERLAP * scaleFactor;
        const outContextSize = contextSize * scaleFactor;
        const outLen = outContextSize * outContextSize;

        const assembledW = padW * scaleFactor;
        const assembledH = padH * scaleFactor;
        const assembled = new Uint8ClampedArray(assembledW * assembledH * 4);

        let globalMin = Infinity;
        let globalMax = -Infinity;
        let hasNaN = false;
        const totalTiles = tilesX * tilesY;
        let done = 0;

        for (let ty = 0; ty < tilesY; ty++) {
          for (let tx = 0; tx < tilesX; tx++) {
            const ex0 = tx * TILE_SIZE;
            const ey0 = ty * TILE_SIZE;

            const tileLen = contextSize * contextSize;
            const tileData = new Float32Array(3 * tileLen);
            for (let ry = 0; ry < contextSize; ry++) {
              const srcRow = (ey0 + ry) * extW + ex0;
              const dstRow = ry * contextSize;
              for (let rx = 0; rx < contextSize; rx++) {
                const s = srcRow + rx;
                const d = dstRow + rx;
                tileData[d] = extended[s];
                tileData[tileLen + d] = extended[extW * extH + s];
                tileData[2 * tileLen + d] = extended[2 * extW * extH + s];
              }
            }

            const inputTensor = new Tensor('float32', tileData, [1, 3, contextSize, contextSize]);
            let outData: Float32Array;
            try {
              const results = await runSess.run({ [runSess.inputNames[0]]: inputTensor });
              const outputTensor = results[runSess.outputNames[0]];
              outData = (await outputTensor.getData()) as Float32Array;
              outputTensor.dispose();
            } catch (err) {
              inputTensor.dispose();
              if (wasmForced) throw err; // already the CPU fallback -- a real error
              console.error('WebGPU sess.run() failed on a tile, falling back to WASM:', err);
              runSess = await fallbackToWasm(scaleFactor);
              const retryTensor = new Tensor('float32', tileData, [1, 3, contextSize, contextSize]);
              const results = await runSess.run({ [runSess.inputNames[0]]: retryTensor });
              const outputTensor = results[runSess.outputNames[0]];
              outData = (await outputTensor.getData()) as Float32Array;
              outputTensor.dispose();
              retryTensor.dispose();
            }
            inputTensor.dispose();

            for (let i = 0; i < outData.length; i++) {
              const v = outData[i];
              if (Number.isNaN(v)) {
                hasNaN = true;
                continue;
              }
              if (v < globalMin) globalMin = v;
              if (v > globalMax) globalMax = v;
            }

            for (let oy = 0; oy < coreOutSize; oy++) {
              const srcRow = (oy + marginOut) * outContextSize + marginOut;
              const dstY = ty * coreOutSize + oy;
              const dstRow = dstY * assembledW + tx * coreOutSize;
              for (let ox = 0; ox < coreOutSize; ox++) {
                const si = srcRow + ox;
                const di = (dstRow + ox) * 4;
                // Real-ESRGAN outputs [0, 1]
                assembled[di] = Math.min(255, Math.max(0, outData[si] * 255.0));
                assembled[di + 1] = Math.min(255, Math.max(0, outData[outLen + si] * 255.0));
                assembled[di + 2] = Math.min(255, Math.max(0, outData[2 * outLen + si] * 255.0));
                assembled[di + 3] = 255;
              }
            }

            done++;
            self.postMessage({
              type: 'PROGRESS',
              data: 0.2 + 0.6 * (done / totalTiles)
            });
          }
        }

        const degenerate = hasNaN || globalMin === globalMax;
        return { assembled, assembledW, assembledH, degenerate, sess: runSess };
      };

      let result = await runTiles(sess);

      if (result.degenerate && !wasmForced) {
        self.postMessage({
          type: 'LOG',
          data: `WebGPU silent failure detected (flat/NaN output). Re-running entire image on WASM...`
        });
        sess = await fallbackToWasm(scaleFactor);
        result = await runTiles(sess);
      }

      self.postMessage({ type: 'PROGRESS', data: 0.85 });
      self.postMessage({ type: 'LOG', data: `Inference done. Packing output...` });

      const outCanvas = new OffscreenCanvas(result.assembledW, result.assembledH);
      const outCtx = outCanvas.getContext('2d')!;
      outCtx.putImageData(new ImageData(result.assembled, result.assembledW, result.assembledH), 0, 0);

      const finalW = width * requestedScale;
      const finalH = height * requestedScale;
      const finalCanvas = new OffscreenCanvas(finalW, finalH);
      const finalCtx = finalCanvas.getContext('2d')!;

      finalCtx.drawImage(
        outCanvas,
        0, 0, finalW, finalH,
        0, 0, finalW, finalH
      );

      self.postMessage({ type: 'PROGRESS', data: 0.95 });

      const blob = await finalCanvas.convertToBlob({ type: 'image/png' });
      const blobUrl = URL.createObjectURL(blob);

      const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      const outName = `${baseName}-upscaled.png`;

      self.postMessage({
        type: 'DONE',
        data: {
          blobUrl,
          outName,
          originalSize: file.size,
          newSize: blob.size,
        }
      });
    } catch (err: any) {
      self.postMessage({ type: 'ERROR', error: err.message || err.toString() });
    }
  }
};

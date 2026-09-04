import { env, InferenceSession, Tensor } from 'onnxruntime-web/webgpu';
import { setupWasmCache } from './ort-wasm-cache';

setupWasmCache();
env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/';

let currentSession: InferenceSession | null = null;

async function loadModel(forceWasm: boolean = false) {
  if (currentSession && !forceWasm) {
    return currentSession;
  }
  
  // Real-ESRGAN produces significantly better results than CARN.
  // It is inherently a 4x model. We'll handle 2x by downscaling the 4x result.
  const modelUrl = `/ai/Real-ESRGAN-General-x4v3-sim.onnx`;

  if (!forceWasm && navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
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
    self.postMessage({ type: 'LOG', data: `Loading Real-ESRGAN model (${forceWasm ? 'WASM' : 'WebGPU'})...` });
    currentSession = await InferenceSession.create(modelUrl, {
      executionProviders: providers
    });
  } catch (err) {
    console.warn(`Failed to load ${modelUrl}.`, err);
    self.postMessage({ type: 'LOG', data: `Failed to load model.` });
    throw err;
  }
  return currentSession;
}

self.onmessage = async (e) => {
  const { type, data } = e.data;

  if (type === 'START') {
    try {
      const { file, scale: requestedScale } = data; // requestedScale is 2 or 4

      self.postMessage({ type: 'PROGRESS', data: 0.1 });
      self.postMessage({ type: 'LOG', data: `Loading image...` });

      const imgBitmap = await createImageBitmap(file);
      const width = imgBitmap.width;
      const height = imgBitmap.height;

      // Ensure padding to multiple of 16 for Real-ESRGAN to prevent WebGPU alignment issues
      const padW = Math.ceil(width / 16) * 16;
      const padH = Math.ceil(height / 16) * 16;

      const inCanvas = new OffscreenCanvas(padW, padH);
      const inCtx = inCanvas.getContext('2d')!;
      inCtx.drawImage(imgBitmap, 0, 0);
      
      const imageData = inCtx.getImageData(0, 0, padW, padH).data;

      self.postMessage({ type: 'PROGRESS', data: 0.3 });
      
      let sess = await loadModel(false);
      let inputName = sess.inputNames[0];

      const len = padW * padH;
      const floatData = new Float32Array(3 * len);
      for (let ry = 0; ry < padH; ry++) {
        const srcRowStart = ry * padW * 4;
        const dstRowStart = ry * padW;
        for (let rx = 0; rx < padW; rx++) {
          const s = srcRowStart + rx * 4;
          const d = dstRowStart + rx;
          // Real-ESRGAN expects [0, 1] inputs
          floatData[d] = imageData[s] / 255.0;
          floatData[len + d] = imageData[s + 1] / 255.0;
          floatData[2 * len + d] = imageData[s + 2] / 255.0;
        }
      }

      self.postMessage({ type: 'PROGRESS', data: 0.5 });
      self.postMessage({ type: 'LOG', data: `Running Real-ESRGAN inference...` });

      const inputTensor = new Tensor('float32', floatData, [1, 3, padH, padW]);
      
      let startTime = performance.now();
      let results = await sess.run({ [inputName]: inputTensor });
      let endTime = performance.now();
      self.postMessage({ type: 'LOG', data: `sess.run() completed in ${(endTime - startTime).toFixed(2)}ms` });
      
      let outputTensor = results[sess.outputNames[0]];
      let outData = (await outputTensor.getData()) as Float32Array;

      let minOut = 999, maxOut = -999;
      let hasNaN = false;
      for (let i = 0; i < outData.length; i++) {
        const val = outData[i];
        if (Number.isNaN(val)) hasNaN = true;
        if (val < minOut) minOut = val;
        if (val > maxOut) maxOut = val;
      }

      // WebGPU silent failure detection
      if (hasNaN || (minOut === 0 && maxOut === 0) || Math.abs(maxOut - minOut) < 0.0001) {
        self.postMessage({ type: 'LOG', data: `WebGPU silent failure detected (min=${minOut}, max=${maxOut}). Falling back to WASM...` });
        sess = await loadModel(true);
        inputName = sess.inputNames[0];
        
        startTime = performance.now();
        results = await sess.run({ [inputName]: inputTensor });
        endTime = performance.now();
        
        self.postMessage({ type: 'LOG', data: `WASM sess.run() completed in ${(endTime - startTime).toFixed(2)}ms` });
        outputTensor = results[sess.outputNames[0]];
        outData = (await outputTensor.getData()) as Float32Array;
        
        minOut = 999; maxOut = -999;
        for (let i = 0; i < outData.length; i++) {
          if (outData[i] < minOut) minOut = outData[i];
          if (outData[i] > maxOut) maxOut = outData[i];
        }
      }

      self.postMessage({ type: 'PROGRESS', data: 0.9 });
      self.postMessage({ type: 'LOG', data: `Inference done. Packing output...` });

      const modelScale = 4; // Real-ESRGAN is x4
      const outW = padW * modelScale;
      const outH = padH * modelScale;
      const outLen = outW * outH;
      const cpuOutBuffer = new Uint8ClampedArray(outLen * 4);

      for (let ry = 0; ry < outH; ry++) {
        const dstRowStart = ry * outW * 4;
        const srcRowStart = ry * outW;
        for (let rx = 0; rx < outW; rx++) {
          const d = dstRowStart + rx * 4;
          const si = srcRowStart + rx;
          // Real-ESRGAN outputs [0, 1]
          cpuOutBuffer[d] = Math.min(255, Math.max(0, outData[si] * 255.0));
          cpuOutBuffer[d + 1] = Math.min(255, Math.max(0, outData[outLen + si] * 255.0));
          cpuOutBuffer[d + 2] = Math.min(255, Math.max(0, outData[2 * outLen + si] * 255.0));
          cpuOutBuffer[d + 3] = 255;
        }
      }

      const outCanvas = new OffscreenCanvas(outW, outH);
      const outCtx = outCanvas.getContext('2d')!;
      outCtx.putImageData(new ImageData(cpuOutBuffer, outW, outH), 0, 0);

      // Final cropping AND scaling (if user asked for 2x instead of 4x)
      const finalW = width * requestedScale;
      const finalH = height * requestedScale;
      const finalCanvas = new OffscreenCanvas(finalW, finalH);
      const finalCtx = finalCanvas.getContext('2d')!;
      
      // Draw the exact un-padded area, scaled appropriately
      const unpaddedModelW = width * modelScale;
      const unpaddedModelH = height * modelScale;
      
      finalCtx.drawImage(
        outCanvas, 
        0, 0, unpaddedModelW, unpaddedModelH, // source rect (unpadded)
        0, 0, finalW, finalH // destination rect
      );

      const blob = await finalCanvas.convertToBlob({ type: 'image/png' });
      const blobUrl = URL.createObjectURL(blob);

      const ext = file.name.split('.').pop() || 'png';
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

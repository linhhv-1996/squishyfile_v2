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

import { FSR_EASU_WGSL, FSR_RCAS_WGSL } from './fsr-shaders';

// ---------------------------------------------------------------------------------
// WebGPU FSR 1.0 Pipeline
// ---------------------------------------------------------------------------------
interface GpuPipeline {
  device: GPUDevice;
  easuPipeline: GPUComputePipeline;
  rcasPipeline: GPUComputePipeline;
  sampler: GPUSampler;
}

let gpu: GpuPipeline | null = null;
let gpuInitPromise: Promise<GpuPipeline> | null = null;

let srcTexture: GPUTexture | null = null;
let easuTexture: GPUTexture | null = null;
let rcasTexture: GPUTexture | null = null;
let stagingBuffer: GPUBuffer | null = null;
let resolutionBuffer: GPUBuffer | null = null;

let easuBindGroup0: GPUBindGroup | null = null;
let easuBindGroup1: GPUBindGroup | null = null;
let rcasBindGroup0: GPUBindGroup | null = null;
let rcasBindGroup1: GPUBindGroup | null = null;

let sizeKey = '';

// Canvas pools
let finalCanvas: OffscreenCanvas | null = null;
let finalCtx: OffscreenCanvasRenderingContext2D | null = null;

let perfFrames = 0;
let perfFrameTotalMs = 0;
let activeProvider: 'webgpu' | 'canvas2d' | null = null;

async function ensureGpuPipeline(): Promise<GpuPipeline | null> {
  if (gpu) return gpu;
  if (gpuInitPromise) return gpuInitPromise;

  gpuInitPromise = (async () => {
    if (!navigator.gpu) {
      throw new Error('WebGPU not supported');
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('No GPU adapter found');

    // FSR doesn't strictly need massive buffers like ONNX, but good to request max limits anyway
    const requiredLimits: Record<string, number> = {};
    if (adapter.limits.maxStorageBufferBindingSize) {
      requiredLimits.maxStorageBufferBindingSize = adapter.limits.maxStorageBufferBindingSize;
    }
    if (adapter.limits.maxBufferSize) {
      requiredLimits.maxBufferSize = adapter.limits.maxBufferSize;
    }

    const device = await adapter.requestDevice({ requiredLimits });
    self.postMessage({ type: 'LOG', data: 'Compiling FSR 1.0 compute shaders...' });

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

    const pipeline: GpuPipeline = { device, easuPipeline, rcasPipeline, sampler };
    gpu = pipeline;
    return pipeline;
  })();

  try {
    return await gpuInitPromise;
  } catch (err) {
    console.warn('WebGPU init failed, falling back to Canvas 2D:', err);
    return null;
  }
}

function ensureSizeResources(g: GpuPipeline, srcW: number, srcH: number, outW: number, outH: number) {
  const key = `${srcW}x${srcH}->${outW}x${outH}`;
  if (sizeKey === key && srcTexture && easuTexture && rcasTexture && stagingBuffer) {
    return;
  }
  sizeKey = key;

  const textureUsage = (globalThis as any).GPUTextureUsage;
  const bufferUsage = (globalThis as any).GPUBufferUsage;

  srcTexture?.destroy();
  srcTexture = g.device.createTexture({
    size: [srcW, srcH],
    format: 'rgba8unorm',
    usage: textureUsage.TEXTURE_BINDING | textureUsage.COPY_DST | textureUsage.RENDER_ATTACHMENT
  });

  easuTexture?.destroy();
  easuTexture = g.device.createTexture({
    size: [outW, outH],
    format: 'rgba8unorm',
    usage: textureUsage.STORAGE_BINDING | textureUsage.TEXTURE_BINDING
  });

  rcasTexture?.destroy();
  rcasTexture = g.device.createTexture({
    size: [outW, outH],
    format: 'rgba8unorm',
    usage: textureUsage.STORAGE_BINDING | textureUsage.COPY_SRC
  });

  const bytesPerRow = Math.ceil((outW * 4) / 256) * 256;
  const packedByteSize = bytesPerRow * outH;

  stagingBuffer?.destroy();
  stagingBuffer = g.device.createBuffer({
    size: packedByteSize,
    usage: bufferUsage.COPY_DST | bufferUsage.MAP_READ
  });

  resolutionBuffer?.destroy();
  resolutionBuffer = g.device.createBuffer({
    size: 16, // 4 x f32
    usage: bufferUsage.UNIFORM | bufferUsage.COPY_DST
  });

  const resData = new Float32Array([srcW, srcH, outW, outH]);
  g.device.queue.writeBuffer(resolutionBuffer, 0, resData);

  easuBindGroup0 = g.device.createBindGroup({
    layout: g.easuPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: srcTexture.createView() },
      { binding: 1, resource: g.sampler },
      { binding: 2, resource: easuTexture.createView() }
    ]
  });

  easuBindGroup1 = g.device.createBindGroup({
    layout: g.easuPipeline.getBindGroupLayout(1),
    entries: [{ binding: 0, resource: { buffer: resolutionBuffer } }]
  });

  rcasBindGroup0 = g.device.createBindGroup({
    layout: g.rcasPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: easuTexture.createView() },
      { binding: 1, resource: rcasTexture.createView() }
    ]
  });

  rcasBindGroup1 = g.device.createBindGroup({
    layout: g.rcasPipeline.getBindGroupLayout(1),
    entries: [{ binding: 0, resource: { buffer: resolutionBuffer } }]
  });
}

function getFrameSize(source: CanvasImageSource): { width: number; height: number } {
  if ('displayWidth' in source) {
    return { width: (source as VideoFrame).displayWidth, height: (source as VideoFrame).displayHeight };
  }
  return { width: source.width as number, height: source.height as number };
}

export async function fsrUpscale(source: CanvasImageSource, srcW: number, srcH: number, scaleFactor: number): Promise<OffscreenCanvas> {
  const frameT0 = performance.now();
  const outW = srcW * scaleFactor;
  const outH = srcH * scaleFactor;

  if (!finalCanvas || finalCanvas.width !== outW || finalCanvas.height !== outH) {
    finalCanvas = new OffscreenCanvas(outW, outH);
    finalCtx = finalCanvas.getContext('2d')!;
  }

  const g = await ensureGpuPipeline();

  if (g) {
    activeProvider = 'webgpu';
    ensureSizeResources(g, srcW, srcH, outW, outH);

    g.device.queue.copyExternalImageToTexture({ source: source as any }, { texture: srcTexture! }, [srcW, srcH]);

    const encoder = g.device.createCommandEncoder();

    // Pass 1: EASU (Upsampling)
    const easuPass = encoder.beginComputePass();
    easuPass.setPipeline(g.easuPipeline);
    easuPass.setBindGroup(0, easuBindGroup0!);
    easuPass.setBindGroup(1, easuBindGroup1!);
    easuPass.dispatchWorkgroups(Math.ceil(outW / 8), Math.ceil(outH / 8));
    easuPass.end();

    // Pass 2: RCAS (Sharpening)
    const rcasPass = encoder.beginComputePass();
    rcasPass.setPipeline(g.rcasPipeline);
    rcasPass.setBindGroup(0, rcasBindGroup0!);
    rcasPass.setBindGroup(1, rcasBindGroup1!);
    rcasPass.dispatchWorkgroups(Math.ceil(outW / 8), Math.ceil(outH / 8));
    rcasPass.end();

    const bytesPerRow = Math.ceil((outW * 4) / 256) * 256;
    encoder.copyTextureToBuffer(
      { texture: rcasTexture! },
      { buffer: stagingBuffer!, bytesPerRow },
      [outW, outH]
    );

    g.device.queue.submit([encoder.finish()]);

    await stagingBuffer!.mapAsync((globalThis as any).GPUMapMode.READ);
    const arrayBuffer = stagingBuffer!.getMappedRange();
    
    // WebGPU copyTextureToBuffer requires bytesPerRow to be a multiple of 256.
    // If our actual width doesn't cleanly divide, we must pack it into a Uint8ClampedArray row by row.
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
    
    stagingBuffer!.unmap();

    finalCtx!.putImageData(new ImageData(finalBytes as any, outW, outH), 0, 0);
  } else {
    // ---- CPU/Canvas2D Fallback ----
    activeProvider = 'canvas2d';
    finalCtx!.imageSmoothingEnabled = true;
    finalCtx!.imageSmoothingQuality = 'high';
    finalCtx!.clearRect(0, 0, outW, outH);
    finalCtx!.drawImage(source, 0, 0, outW, outH);
  }

  perfFrames++;
  perfFrameTotalMs += performance.now() - frameT0;
  if (perfFrames === 1 || perfFrames % 30 === 0) {
    self.postMessage({
      type: 'LOG',
      data: `[perf/${activeProvider}/FSR1] frame ${perfFrames}: avg processFrame()=${(perfFrameTotalMs / perfFrames).toFixed(1)}ms/frame`
    });
  }

  return finalCanvas;
}

self.onmessage = async (e) => {
  const { type, data } = e.data;

  if (type === 'START') {
    try {
      const { file, scale } = data;
      const scaleFactor = scale === 2 ? 2 : 4;

      self.postMessage({ type: 'LOG', data: `Started upscaling ${scaleFactor}x via FSR 1.0...` });

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
            const source = sample.toCanvasImageSource();
            const srcDisplayW = ('displayWidth' in source) ? (source as VideoFrame).displayWidth : source.width as number;
            const srcDisplayH = ('displayWidth' in source) ? (source as VideoFrame).displayHeight : source.height as number;
            return await fsrUpscale(source, srcDisplayW, srcDisplayH, scaleFactor);
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

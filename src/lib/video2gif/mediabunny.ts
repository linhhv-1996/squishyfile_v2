/**
 * Mediabunny + gifenc engine -- the only engine for video -> GIF (no
 * ffmpeg.wasm fallback yet; see the worker's file header for why that's an
 * acceptable first pass).
 *
 * Pipeline: Mediabunny's CanvasSink decodes+crops+resizes frames straight
 * to canvases at our chosen output dimensions (so no separate resize step
 * is needed), we sample one canvas per planned timestamp, quantize a
 * shared/global palette from all of them, then hand indexed frames to
 * gifenc. gifenc ships no dithering of its own, so Floyd-Steinberg
 * error-diffusion dithering is implemented here by hand against the fixed
 * global palette when the user has it enabled.
 */
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import { GIFEncoder, applyPalette, nearestColorIndex, quantize, type PaletteColor } from 'gifenc';
import {
	planCropRect,
	planDimensions,
	planFrameDelayMs,
	planFrameTimestamps,
	type GifOptions,
	type SourceVideoInfo
} from './plan';

/** Thrown when this engine can't handle the file's container at all. */
export class UnsupportedByMediabunnyError extends Error {}

/** Thrown when the file is readable but simply has no video track. */
export class NoVideoTrackError extends Error {}

export async function probe(file: File): Promise<SourceVideoInfo> {
	const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });

	let videoTrack;
	try {
		videoTrack = await input.getPrimaryVideoTrack();
	} catch {
		throw new UnsupportedByMediabunnyError('Mediabunny cannot read this container');
	}
	if (!videoTrack) throw new NoVideoTrackError('This file has no video track');

	const durationSec = await input.computeDuration();

	return {
		durationSec,
		width: videoTrack.displayWidth,
		height: videoTrack.displayHeight
	};
}

export type GifProgressStage = 'decoding' | 'quantizing' | 'encoding';

type DecodedFrame = { data: Uint8ClampedArray };

/**
 * Cap on how many pixels get sampled to build the shared/global color
 * palette. Quantizing every pixel of every frame doesn't meaningfully
 * improve palette quality past a certain sample size and would make longer
 * clips painfully slow to convert.
 */
const MAX_PALETTE_SAMPLE_PIXELS = 300_000;

function buildPaletteSample(frames: DecodedFrame[]): Uint8Array {
	const totalPixels = frames.reduce((sum, f) => sum + f.data.length / 4, 0);
	const stride = Math.max(1, Math.floor(totalPixels / MAX_PALETTE_SAMPLE_PIXELS));

	const out: number[] = [];
	let pixelIndex = 0;
	for (const frame of frames) {
		const data = frame.data;
		for (let i = 0; i < data.length; i += 4) {
			if (pixelIndex % stride === 0) {
				out.push(data[i], data[i + 1], data[i + 2], data[i + 3]);
			}
			pixelIndex++;
		}
	}
	return new Uint8Array(out);
}

/** Floyd-Steinberg error-diffusion dithering against a fixed RGB palette. */
function ditherToIndices(
	data: Uint8ClampedArray,
	width: number,
	height: number,
	palette: PaletteColor[]
): Uint8Array {
	// Work in a float buffer so accumulated error isn't clamped/truncated
	// away between neighboring pixels the way a Uint8 buffer would.
	const buf = new Float32Array(data.length);
	for (let i = 0; i < data.length; i++) buf[i] = data[i];

	const index = new Uint8Array(width * height);

	const addError = (x: number, y: number, er: number, eg: number, eb: number, weight: number) => {
		if (x < 0 || x >= width || y < 0 || y >= height) return;
		const i = (y * width + x) * 4;
		buf[i] += er * weight;
		buf[i + 1] += eg * weight;
		buf[i + 2] += eb * weight;
	};

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			const r = Math.min(255, Math.max(0, buf[i]));
			const g = Math.min(255, Math.max(0, buf[i + 1]));
			const b = Math.min(255, Math.max(0, buf[i + 2]));

			const idx = nearestColorIndex(palette, [r, g, b]);
			index[y * width + x] = idx;

			const [pr, pg, pb] = palette[idx];
			const er = r - pr;
			const eg = g - pg;
			const eb = b - pb;

			addError(x + 1, y, er, eg, eb, 7 / 16);
			addError(x - 1, y + 1, er, eg, eb, 3 / 16);
			addError(x, y + 1, er, eg, eb, 5 / 16);
			addError(x + 1, y + 1, er, eg, eb, 1 / 16);
		}
	}

	return index;
}

export async function convertWithMediabunny(
	file: File,
	source: SourceVideoInfo,
	options: GifOptions,
	onProgress: (stage: GifProgressStage, fraction: number) => void,
	signal?: AbortSignal
): Promise<Blob> {
	const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
	const videoTrack = await input.getPrimaryVideoTrack();
	if (!videoTrack) throw new NoVideoTrackError('This file has no video track');

	const { width, height } = planDimensions(source, options);
	const crop = planCropRect(source, options.crop) ?? undefined;

	// CanvasSink does the crop + resize for us -- every canvas it yields is
	// already at our exact target dimensions, so getImageData below needs no
	// separate scaling pass.
	const sink = new CanvasSink(videoTrack, { width, height, crop, fit: 'fill' });
	const timestamps = planFrameTimestamps(options);

	const frames: DecodedFrame[] = [];
	let decodedCount = 0;
	// canvasesAtTimestamps yields null for a timestamp before the track's
	// first frame -- fall back to the previous decoded frame rather than
	// dropping it, so the output is never shorter than the requested range.
	let lastData: Uint8ClampedArray | null = null;

	for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
		if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

		let data: Uint8ClampedArray | null = lastData;
		if (wrapped) {
			const ctx = wrapped.canvas.getContext('2d') as
				| CanvasRenderingContext2D
				| OffscreenCanvasRenderingContext2D
				| null;
			if (!ctx) throw new Error('Could not get a 2D canvas context');
			data = ctx.getImageData(0, 0, width, height).data as unknown as Uint8ClampedArray;
			lastData = data;
		}
		if (data) frames.push({ data });

		decodedCount++;
		onProgress('decoding', decodedCount / timestamps.length);
	}

	if (frames.length === 0) throw new Error('No frames could be decoded from this video');

	if (options.reverse) frames.reverse();

	onProgress('quantizing', 0);
	const paletteSample = buildPaletteSample(frames);
	const palette = quantize(paletteSample, options.colors, { format: 'rgb565' });
	onProgress('quantizing', 1);

	const gif = GIFEncoder();
	const delay = planFrameDelayMs(options);
	// gifenc: -1 = play once, 0 = loop forever.
	const repeat = options.loop === 'infinite' ? 0 : -1;

	for (let i = 0; i < frames.length; i++) {
		if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

		const frameData = frames[i].data;
		const index = options.dithering
			? ditherToIndices(frameData, width, height, palette)
			: applyPalette(frameData, palette, 'rgb565');

		gif.writeFrame(index, width, height, {
			// Only the first frame carries the global color table -- every
			// later frame reuses it by omitting `palette` entirely.
			palette: i === 0 ? palette : undefined,
			delay,
			repeat
		});

		onProgress('encoding', (i + 1) / frames.length);
	}

	gif.finish();
	const bytes = gif.bytes();
	// Copy out of the encoder's internal growable buffer so the returned
	// Blob's data doesn't depend on that buffer's lifetime.
	const copy = new Uint8Array(bytes.length);
	copy.set(bytes);
	return new Blob([copy], { type: 'image/gif' });
}

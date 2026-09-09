/**
 * Mediabunny engine -- the fast path for any container Mediabunny can
 * demux (MP4, MOV, WebM, MKV, TS, ...). Structural sibling of
 * video2gif/mediabunny.ts, but simpler: there's no palette quantization or
 * LZW encoding step here -- CanvasSink decodes straight to a canvas at the
 * source's native resolution for each requested timestamp, and the canvas
 * is encoded directly to a PNG/JPEG Blob via the canvas's own encoder
 * (convertToBlob in a worker, toBlob on the rare fallback path where the
 * environment hands back a plain HTMLCanvasElement instead).
 */
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import { planFrameTimestamps, type FrameExtractOptions, type SourceVideoInfo } from './plan';

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

export type ExtractedFrame = { timestampSec: number; blob: Blob };

function canvasToBlob(
	canvas: HTMLCanvasElement | OffscreenCanvas,
	mimeType: string,
	quality: number | undefined
): Promise<Blob> {
	// OffscreenCanvas (what CanvasSink hands back inside a worker, which is
	// where this always runs) has convertToBlob; the plain-callback toBlob
	// is only here as a fallback in case a future caller ever runs this on
	// the main thread with a real HTMLCanvasElement instead.
	if ('convertToBlob' in canvas) {
		return canvas.convertToBlob({ type: mimeType, quality });
	}
	return new Promise((resolve, reject) => {
		(canvas as HTMLCanvasElement).toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
			mimeType,
			quality
		);
	});
}

export async function extractFramesWithMediabunny(
	file: File,
	source: SourceVideoInfo,
	options: FrameExtractOptions,
	onProgress: (fraction: number) => void,
	signal?: AbortSignal
): Promise<ExtractedFrame[]> {
	const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
	const videoTrack = await input.getPrimaryVideoTrack();
	if (!videoTrack) throw new NoVideoTrackError('This file has no video track');

	// No width/height passed -- CanvasSink defaults to the track's own
	// display size, which is exactly what a "give me a still frame" tool
	// wants (unlike video2gif, which deliberately downsizes for GIF file
	// size). 'fill' fit is irrelevant with no explicit target box, kept
	// only for parity with how the sink is constructed elsewhere.
	const sink = new CanvasSink(videoTrack, { fit: 'fill' });
	const timestamps = planFrameTimestamps(source, options);

	const mimeType = options.format === 'png' ? 'image/png' : 'image/jpeg';
	const quality = options.format === 'jpeg' ? Math.min(1, Math.max(0, options.jpegQuality / 100)) : undefined;

	const frames: ExtractedFrame[] = [];
	let decodedCount = 0;
	// canvasesAtTimestamps yields null for a timestamp before the track's
	// first frame -- fall back to the most recently decoded canvas rather
	// than dropping the request, same reasoning as video2gif/mediabunny.ts's
	// lastData fallback: the output should never end up shorter than the
	// number of timestamps we asked for.
	let lastCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;

	for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
		if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

		const canvas = wrapped?.canvas ?? lastCanvas;
		if (wrapped) lastCanvas = wrapped.canvas;

		if (canvas) {
			const blob = await canvasToBlob(canvas, mimeType, quality);
			frames.push({ timestampSec: timestamps[decodedCount], blob });
		}

		decodedCount++;
		onProgress(decodedCount / timestamps.length);
	}

	if (frames.length === 0) throw new Error('No frames could be decoded from this video');
	return frames;
}

/**
 * Pure planning for video -> GIF conversion -- no browser/encoder APIs.
 *
 * Structural sibling of video2mp3/plan.ts: all the "what should we encode
 * at" decisions live here as pure functions so the worker (video2gif.worker.ts)
 * and the UI (ConvertVideoToGif.svelte) can share one source of truth and so
 * the logic here is trivially unit-testable without touching a browser.
 *
 * NOTE: this is a first pass -- wired up with the required controls (trim,
 * fps, resolution, quality/dithering) plus a few of the "nice to have" ones
 * (loop, speed, reverse, a rough size estimate). Manual crop-region
 * dragging and a real pre-encode size estimate are left for a follow-up;
 * crop currently ships as centered aspect-ratio presets only.
 */

/** FPS options offered in the UI. GIFs rarely benefit from more than ~20fps. */
export type GifFps = 5 | 8 | 10 | 15 | 20 | 24;
export const GIF_FPS_OPTIONS: GifFps[] = [5, 8, 10, 15, 20, 24];
export const DEFAULT_GIF_FPS: GifFps = 8;

/**
 * Max output width in pixels, or 'original' to keep the source width
 * (never upscaled -- see clampMaxWidth). GIF doesn't compress anywhere near
 * as well as video, so keeping this modest is what keeps file sizes sane.
 */
export type GifResolution = 240 | 360 | 480 | 640 | 720 | 'original';
export const GIF_RESOLUTIONS: GifResolution[] = [240, 360, 480, 640, 720, 'original'];
export const DEFAULT_GIF_RESOLUTION: GifResolution = 360;

/** Palette size. GIF frames are always paletted, max 256 colors. */
export type GifColorCount = 64 | 128 | 256;
export const GIF_COLOR_OPTIONS: GifColorCount[] = [64, 128, 256];
export const DEFAULT_GIF_COLORS: GifColorCount = 256;

export type GifLoop = 'infinite' | 'once';
export const DEFAULT_GIF_LOOP: GifLoop = 'infinite';

export type GifSpeed = 0.5 | 1 | 1.5 | 2 | 3 | 4;
export const GIF_SPEED_OPTIONS: GifSpeed[] = [0.5, 1, 1.5, 2, 3, 4];
export const DEFAULT_GIF_SPEED: GifSpeed = 1;

/** Centered-crop aspect presets. 'free' means "don't crop, keep source AR". */
export type GifCropPreset = 'free' | '1:1' | '16:9' | '9:16' | '4:3';
export const GIF_CROP_PRESETS: GifCropPreset[] = ['free', '1:1', '16:9', '9:16', '4:3'];
export const DEFAULT_GIF_CROP: GifCropPreset = 'free';

/** Everything the planner needs to know about the source video. */
export type SourceVideoInfo = {
	durationSec: number;
	/** Display (rotation-corrected) width/height, in pixels. */
	width: number;
	height: number;
};

export type CropRect = { left: number; top: number; width: number; height: number };

export type GifOptions = {
	/** Trim range, in source seconds, before speed is applied. */
	startSec: number;
	endSec: number;
	fps: GifFps;
	maxWidth: GifResolution;
	colors: GifColorCount;
	dithering: boolean;
	loop: GifLoop;
	speed: GifSpeed;
	reverse: boolean;
	crop: GifCropPreset;
};

/**
 * The max-width choices worth offering for a given source -- a preset wider
 * than the source is never useful (it just gets silently clamped down to
 * the source width at encode time, per clampMaxWidth below), so a 360p
 * source shouldn't list 480/640/720 as if picking one did anything.
 * 'original' always stays available since it always means "source width".
 */
export function availableGifResolutions(source: SourceVideoInfo): GifResolution[] {
	return GIF_RESOLUTIONS.filter((r) => r === 'original' || r <= source.width);
}

/**
 * Picks a sensible default max width for the source: the fixed default
 * when the source is wide enough for it, otherwise the largest preset that
 * still fits, or 'original' if the source is narrower than every preset.
 */
function defaultMaxWidthFor(source: SourceVideoInfo): GifResolution {
	if (source.width >= (DEFAULT_GIF_RESOLUTION as number)) return DEFAULT_GIF_RESOLUTION;
	const fitting = GIF_RESOLUTIONS.filter(
		(r): r is Exclude<GifResolution, 'original'> => r !== 'original' && r <= source.width
	);
	return fitting.length ? (Math.max(...fitting) as GifResolution) : 'original';
}

export function defaultGifOptions(source: SourceVideoInfo): GifOptions {
	return {
		startSec: 0,
		endSec: source.durationSec,
		fps: DEFAULT_GIF_FPS,
		maxWidth: defaultMaxWidthFor(source),
		colors: DEFAULT_GIF_COLORS,
		dithering: true,
		loop: DEFAULT_GIF_LOOP,
		speed: DEFAULT_GIF_SPEED,
		reverse: false,
		crop: DEFAULT_GIF_CROP
	};
}

/** Never upscale past the source's own width. */
function clampMaxWidth(maxWidth: GifResolution, sourceWidth: number): number {
	if (maxWidth === 'original') return sourceWidth;
	return Math.min(maxWidth, sourceWidth);
}

/**
 * Centered crop rectangle for a given aspect preset, clamped to the
 * source's actual dimensions. Returns null for 'free' (no crop).
 */
export function planCropRect(source: SourceVideoInfo, preset: GifCropPreset): CropRect | null {
	if (preset === 'free') return null;

	const [aw, ah] = preset.split(':').map(Number);
	const sourceAspect = source.width / source.height;
	const targetAspect = aw / ah;

	let width: number;
	let height: number;
	if (targetAspect > sourceAspect) {
		// Target is wider than source -- crop top/bottom.
		width = source.width;
		height = Math.round(source.width / targetAspect);
	} else {
		width = Math.round(source.height * targetAspect);
		height = source.height;
	}

	width = Math.min(width, source.width);
	height = Math.min(height, source.height);

	return {
		left: Math.round((source.width - width) / 2),
		top: Math.round((source.height - height) / 2),
		width,
		height
	};
}

/** Output pixel dimensions after crop + resize, keeping aspect ratio. */
export function planDimensions(source: SourceVideoInfo, options: GifOptions): { width: number; height: number } {
	const crop = planCropRect(source, options.crop);
	const baseWidth = crop ? crop.width : source.width;
	const baseHeight = crop ? crop.height : source.height;

	const outWidth = clampMaxWidth(options.maxWidth, baseWidth);
	const outHeight = Math.max(1, Math.round((outWidth / baseWidth) * baseHeight));

	// GIF dimensions must be even-ish and at least 1px; odd widths are fine
	// for GIF (unlike some video codecs) so no extra rounding is needed
	// beyond keeping things positive.
	return { width: Math.max(1, Math.round(outWidth)), height: outHeight };
}

/**
 * The source timestamps (in seconds) to sample a frame at, one per output
 * GIF frame. `speed` stretches/compresses how fast we step through the
 * trimmed source range -- 2x speed steps through source time twice as fast
 * per output frame (fewer seconds of source per frame at the same fps),
 * which is what makes the resulting GIF play back faster while every frame
 * still gets an equal, constant on-screen delay.
 */
export function planFrameTimestamps(options: GifOptions): number[] {
	const trimmedDuration = Math.max(0, options.endSec - options.startSec);
	const outputDuration = trimmedDuration / options.speed;
	const frameCount = Math.max(1, Math.round(outputDuration * options.fps));

	const step = (1 / options.fps) * options.speed;
	const timestamps: number[] = [];
	for (let i = 0; i < frameCount; i++) {
		const t = options.startSec + i * step;
		timestamps.push(Math.min(t, options.endSec));
	}
	return timestamps;
}

/** Per-frame delay in milliseconds, constant across the whole GIF. */
export function planFrameDelayMs(options: GifOptions): number {
	return Math.round(1000 / options.fps);
}

/**
 * Rough, pre-encode size estimate in bytes. This is a heuristic, not a
 * simulation of the real encoder -- LZW compression ratio depends heavily
 * on how much the content actually changes frame to frame, which we can't
 * know without decoding, so this only aims to be in the right ballpark
 * (used to warn "this is going to be huge" before the user commits to a
 * multi-second encode).
 */
export function estimateGifSizeBytes(source: SourceVideoInfo, options: GifOptions): number {
	const { width, height } = planDimensions(source, options);
	const frameCount = planFrameTimestamps(options).length;

	// Bits-per-pixel-per-frame heuristic scaled by palette size (a smaller
	// palette and dithering both tend to compress better with LZW because
	// runs repeat more), tuned against a handful of real encodes rather than
	// derived analytically.
	const bppByColors: Record<GifColorCount, number> = { 64: 0.9, 128: 1.3, 256: 1.8 };
	const bpp = bppByColors[options.colors] * (options.dithering ? 1.15 : 1);

	const bytesPerFrame = (width * height * bpp) / 8;
	// Only the first frame carries the full logical-screen/palette header;
	// negligible next to frame data for anything but a 1-frame GIF, so it's
	// omitted here for simplicity.
	return Math.round(bytesPerFrame * frameCount);
}

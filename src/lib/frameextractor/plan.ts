/**
 * Pure planning for the Frame Extractor tool -- no browser/decoder APIs.
 *
 * Structural sibling of video2gif/plan.ts and compress/plan.ts: every "what
 * timestamp(s) should we grab a frame at" decision lives here as pure
 * functions, so the worker (frameextractor.worker.ts) and the UI
 * (ExtractVideoFrames.svelte) share one source of truth, and so the actual
 * timestamp math is unit-testable without touching Mediabunny, ffmpeg.wasm
 * or a real video file (see plan.test.mjs).
 *
 * The one primitive every mode reduces to is `planFrameTimestamps`: given
 * the source's duration and a mode + its params, produce a sorted, deduped
 * list of target timestamps in seconds. Everything else (engines, canvas
 * decoding, zip packaging) just consumes that list.
 */

/** Everything the planner needs to know about the source video. */
export type SourceVideoInfo = {
	durationSec: number;
	/** Display (rotation-corrected) width/height, in pixels. Not used by the
	 *  timestamp math itself, but kept alongside duration since every engine
	 *  probe already returns it and callers want it for the UI. */
	width: number;
	height: number;
};

export type FrameExtractMode = 'current' | 'interval' | 'range' | 'count';

export type ImageFormat = 'png' | 'jpeg';
export const DEFAULT_IMAGE_FORMAT: ImageFormat = 'png';
export const DEFAULT_JPEG_QUALITY = 90;
export const MIN_JPEG_QUALITY = 1;
export const MAX_JPEG_QUALITY = 100;

/** "1 frame every N seconds" -- both for the whole-video interval mode and
 *  for the bounded interval-within-a-range mode. 0.5-60s covers everything
 *  from a fast thumbnail scrub to a once-a-minute sample. */
export const MIN_INTERVAL_SEC = 0.5;
export const MAX_INTERVAL_SEC = 60;
export const DEFAULT_INTERVAL_SEC = 1;

/** "N frames evenly spaced across the whole clip" -- thumbnail-sheet mode. */
export const MIN_FRAME_COUNT = 1;
export const MAX_FRAME_COUNT = 60;
export const DEFAULT_FRAME_COUNT = 10;

export type FrameExtractOptions = {
	mode: FrameExtractMode;
	/** Seconds, for mode 'current'. */
	currentSec: number;
	/** Seconds, for mode 'interval' (applied across the whole clip). */
	intervalSec: number;
	/** Seconds, for mode 'range'. */
	rangeStartSec: number;
	rangeEndSec: number;
	/** Seconds, for mode 'range' -- interval applied only within the range.
	 *
	 * Range mode deliberately only offers "every N seconds within the
	 * range", not a separate "every single native frame" option: a native
	 * per-frame extraction across even a modest range (say 10s at 30fps) is
	 * 300 individual decodes+encodes+zip entries, which is a lot of
	 * output for a "give me some stills" tool and a lot of main-thread/
	 * worker time for very little extra usefulness over just setting the
	 * interval very small (e.g. 1/30s) if someone genuinely wants that
	 * density. Keeping one control (the interval) that can already be
	 * pushed that low covers the real use case without a second mode that
	 * mostly just produces enormous zip files by accident.
	 */
	rangeIntervalSec: number;
	/** For mode 'count'. */
	count: number;
	format: ImageFormat;
	/** 1-100, only meaningful when format === 'jpeg'. */
	jpegQuality: number;
};

export function defaultFrameExtractOptions(source: SourceVideoInfo): FrameExtractOptions {
	return {
		mode: 'current',
		currentSec: 0,
		intervalSec: DEFAULT_INTERVAL_SEC,
		rangeStartSec: 0,
		rangeEndSec: source.durationSec,
		rangeIntervalSec: DEFAULT_INTERVAL_SEC,
		count: DEFAULT_FRAME_COUNT,
		format: DEFAULT_IMAGE_FORMAT,
		jpegQuality: DEFAULT_JPEG_QUALITY
	};
}

function clamp(value: number, lo: number, hi: number): number {
	if (hi < lo) return lo;
	return Math.min(hi, Math.max(lo, value));
}

// Two timestamps within a millisecond of each other are the same frame for
// any real video (no format has sub-millisecond frame timing) -- collapsing
// them here keeps a request like "range 0..duration at the interval" from
// producing a spurious duplicate of the last frame when float rounding
// lands a generated step a hair past `end`.
const DEDUPE_EPSILON_SEC = 1 / 1000;

function dedupeSorted(timestamps: number[]): number[] {
	const sorted = [...timestamps].sort((a, b) => a - b);
	const out: number[] = [];
	for (const t of sorted) {
		if (out.length === 0 || t - out[out.length - 1] > DEDUPE_EPSILON_SEC) out.push(t);
	}
	return out;
}

/**
 * One timestamp every `stepSec`, starting at `start`, never past `end`.
 * Always includes `start` (even when `end - start` is 0 or smaller than a
 * single step) so a degenerate range still yields exactly one frame instead
 * of none.
 */
function timestampsAtInterval(start: number, end: number, stepSec: number): number[] {
	const span = Math.max(0, end - start);
	const step = Math.max(MIN_INTERVAL_SEC, stepSec);
	if (span <= 0) return [start];

	// +1 to include the boundary at `start` itself alongside every full step
	// that still fits within the span.
	const count = Math.floor(span / step) + 1;
	const out: number[] = [];
	for (let i = 0; i < count; i++) {
		out.push(Math.min(end, start + i * step));
	}
	return out;
}

/**
 * `count` timestamps evenly spaced across [start, end]. A single frame
 * lands on the midpoint (there's no natural "first/last" for exactly one
 * thumbnail); two or more span the full range inclusive of both ends, which
 * is what makes a thumbnail sheet actually cover the whole clip.
 */
function timestampsEvenlySpaced(start: number, end: number, count: number): number[] {
	const n = Math.max(1, Math.round(count));
	if (n === 1) return [start + (end - start) / 2];

	const out: number[] = [];
	for (let i = 0; i < n; i++) {
		out.push(start + (i / (n - 1)) * (end - start));
	}
	return out;
}

/**
 * The core primitive: given the source's duration and the chosen mode +
 * params, produce the sorted, deduped timestamps (in seconds) to extract a
 * frame at. Every extraction mode -- current frame, fixed interval, a
 * bounded range, or an evenly-spaced count -- reduces to this one function,
 * which is what makes it worth unit-testing on its own (see plan.test.mjs).
 */
export function planFrameTimestamps(source: SourceVideoInfo, options: FrameExtractOptions): number[] {
	const duration = Math.max(0, source.durationSec);

	switch (options.mode) {
		case 'current': {
			return [clamp(options.currentSec, 0, duration)];
		}

		case 'interval': {
			const step = clamp(options.intervalSec, MIN_INTERVAL_SEC, MAX_INTERVAL_SEC);
			return dedupeSorted(timestampsAtInterval(0, duration, step));
		}

		case 'range': {
			const start = clamp(options.rangeStartSec, 0, duration);
			const end = clamp(options.rangeEndSec, start, duration);
			const step = clamp(options.rangeIntervalSec, MIN_INTERVAL_SEC, MAX_INTERVAL_SEC);
			return dedupeSorted(timestampsAtInterval(start, end, step));
		}

		case 'count': {
			const n = clamp(Math.round(options.count), MIN_FRAME_COUNT, MAX_FRAME_COUNT);
			return dedupeSorted(timestampsEvenlySpaced(0, duration, n));
		}

		default: {
			// Exhaustiveness guard -- if a new mode is ever added without a
			// matching case above, this makes it a loud runtime error instead
			// of a silently-empty result.
			throw new Error(`Unknown frame extraction mode: ${options.mode as string}`);
		}
	}
}

/** mm:ss (zero-padded) suitable for embedding in a filename, e.g. "03m07s". */
export function formatTimecodeForFilename(sec: number): string {
	const total = Math.max(0, Math.round(sec));
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`;
}

export function outputBaseName(originalFileName: string): string {
	return originalFileName.replace(/\.[^.]+$/, '') || 'video';
}

function extensionFor(format: ImageFormat): string {
	return format === 'png' ? 'png' : 'jpg';
}

/** File name for the single-frame download path (modes with exactly one
 *  planned timestamp -- 'current', or any other mode that happens to
 *  collapse to one frame). */
export function singleFrameFileName(originalFileName: string, timestampSec: number, format: ImageFormat): string {
	return `${outputBaseName(originalFileName)}_frame_${formatTimecodeForFilename(timestampSec)}.${extensionFor(format)}`;
}

/** File name for one entry inside the multi-frame zip, e.g.
 *  "frame_0001_00m03s.png". `total` sizes the zero-padded index so it never
 *  runs out of digits (minimum 4, matching the spec's example naming). */
export function frameEntryFileName(index: number, timestampSec: number, format: ImageFormat, total: number): string {
	const width = Math.max(4, String(total).length);
	const n = String(index + 1).padStart(width, '0');
	return `frame_${n}_${formatTimecodeForFilename(timestampSec)}.${extensionFor(format)}`;
}

export function zipFileName(originalFileName: string): string {
	return `frames_${outputBaseName(originalFileName)}.zip`;
}

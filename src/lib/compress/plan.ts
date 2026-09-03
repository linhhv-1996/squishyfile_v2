/**
 * Pure compression planning — no browser APIs, no encoder APIs.
 *
 * This module answers the only question that actually matters for video
 * compression: *given this source and this goal, what resolution, frame rate
 * and bitrate should we encode at?* Both engines (Mediabunny and ffmpeg.wasm)
 * consume the same plan, so they behave identically.
 *
 * The central idea is **bits per pixel per frame** (bpp):
 *
 *     bpp = videoBitrate / (width * height * frameRate)
 *
 * bpp — not bitrate — is what determines how a video *looks*. 2 Mbps is
 * generous at 480p and unwatchable at 4K. So whenever a bitrate is forced on
 * us (target-size mode), we don't keep the source resolution and let the
 * encoder smear it into mush; we pick the largest resolution that the
 * available bitrate can actually sustain.
 *
 * Rough H.264 reference points for bpp:
 *   0.15+  visually transparent
 *   0.10   good (YouTube-ish)
 *   0.075  acceptable — our floor for target-size mode
 *   0.05   soft, blocky on motion
 *   0.03-  falling apart
 */

/** How the user asked for compression. */
export type CompressionLevel = 1 | 2 | 3;

/** Everything the planner needs to know about the input file. */
export type SourceInfo = {
	/** Duration in seconds. */
	durationSec: number;
	/** Display width in pixels (after rotation / pixel-aspect correction). */
	width: number;
	/** Display height in pixels (after rotation / pixel-aspect correction). */
	height: number;
	/** Frames per second. Pass 0 if unknown — we assume 30. */
	frameRate: number;
	/** Measured video-track bitrate in bits/sec, or null if unknown. */
	videoBitrate: number | null;
	/** Total file size in bytes. */
	totalBytes: number;
	hasAudio: boolean;
	/** Source channel count (ignored when there is no audio). */
	audioChannels: number;
};

export type PlanWarning =
	/** Target is bigger than the source file — there is nothing to squish. */
	| 'target_above_source'
	/** We had to drop below the quality floor; output will look rough. */
	| 'quality_will_be_poor'
	/** We downscaled the video to keep it watchable at this bitrate. */
	| 'resolution_reduced'
	/** We halved the frame rate to buy back resolution. */
	| 'framerate_reduced'
	/** The budget was too small to carry an audio track. */
	| 'audio_removed';

export type CompressionPlan = {
	mode: 'level' | 'target';
	width: number;
	height: number;
	frameRate: number;
	/** Video bitrate in bits/sec. Always meaningful, even in level mode. */
	videoBitrate: number;
	/**
	 * Constant-quality parameter (H.264 QP, 0-51, lower = better). Only set in
	 * level mode, where predictable *quality* beats predictable *size*.
	 * `videoBitrate` is the fallback when the encoder can't do quantizers.
	 */
	quantizer: number | null;
	/** Audio bitrate in bits/sec, or null to drop the audio track. */
	audioBitrate: number | null;
	audioChannels: number;
	/** Seconds between keyframes. */
	keyFrameInterval: number;
	/** True when the source was already thinner than the budget. */
	cappedBySource: boolean;
	warnings: PlanWarning[];
};

/**
 * Candidate short-edge sizes, largest first. We ladder on the *short* edge so
 * portrait video (every phone video ever) is treated the same as landscape —
 * a 1080x1920 iPhone clip is "1080p", not "1920p".
 */
export const SHORT_EDGE_LADDER = [2160, 1440, 1080, 720, 540, 480, 360, 270, 180, 144] as const;

/** Quality floor for target-size mode. Below this, we downscale instead. */
const TARGET_BPP_FLOOR = 0.075;

/** Never emit a video track thinner than this — it stops being video. */
const MIN_VIDEO_BITRATE = 45_000;

/** MP4 container + index overhead. Small, but it's the difference between 24.9 and 25.1 MB. */
const MUX_OVERHEAD = 0.985;

/**
 * We aim slightly under the target on the first pass. Encoders overshoot more
 * often than they undershoot, and one wasted re-encode costs far more than a
 * few percent of unused budget.
 */
const TARGET_SAFETY = 0.94;

const LEVELS: Record<
	CompressionLevel,
	{ maxShortEdge: number; bpp: number; sourceFactor: number; quantizer: number; fpsCap: number }
> = {
	// Light — keep the resolution, shave the fat off over-bitrated camera files.
	1: { maxShortEdge: Infinity, bpp: 0.115, sourceFactor: 0.65, quantizer: 26, fpsCap: Infinity },
	// Balanced — cap at 1080p, the sweet spot for sharing.
	2: { maxShortEdge: 1080, bpp: 0.08, sourceFactor: 0.38, quantizer: 31, fpsCap: 60 },
	// Max squish — cap at 720p30 and accept visible softness.
	3: { maxShortEdge: 720, bpp: 0.055, sourceFactor: 0.22, quantizer: 36, fpsCap: 30 }
};

/** H.264 wants even dimensions (4:2:0 chroma is subsampled by 2). */
function even(n: number): number {
	return Math.max(2, Math.round(n / 2) * 2);
}

/** Scale a frame so its short edge becomes `shortEdge`, preserving aspect. */
function scaleToShortEdge(width: number, height: number, shortEdge: number) {
	const srcShort = Math.min(width, height);
	const ratio = shortEdge / srcShort;
	return { width: even(width * ratio), height: even(height * ratio) };
}

/**
 * Pick the largest ladder rung whose bpp still clears `minBpp` at the given
 * bitrate. Never upscales past the source, never exceeds `maxShortEdge`.
 */
function pickResolution(
	srcWidth: number,
	srcHeight: number,
	bitrate: number,
	frameRate: number,
	minBpp: number,
	maxShortEdge: number
) {
	const srcShort = Math.min(srcWidth, srcHeight);
	const cap = Math.min(srcShort, maxShortEdge);
	const rungs = SHORT_EDGE_LADDER.filter((r) => r <= cap);
	// A source smaller than the smallest rung (or a weird tiny video) still
	// needs a candidate — use its own size.
	const candidates: number[] = rungs.length > 0 ? [...rungs] : [srcShort];
	if (candidates[0] < cap) candidates.unshift(cap);

	for (const rung of candidates) {
		const dims = scaleToShortEdge(srcWidth, srcHeight, rung);
		if (bitrate / (dims.width * dims.height * frameRate) >= minBpp) {
			return { ...dims, shortEdge: rung, belowFloor: false };
		}
	}

	const smallest = candidates[candidates.length - 1];
	return {
		...scaleToShortEdge(srcWidth, srcHeight, smallest),
		shortEdge: smallest,
		belowFloor: true
	};
}

function normalizedFrameRate(src: SourceInfo): number {
	// Some containers report nonsense (0, or 1000 for VFR). Clamp to sanity.
	if (!Number.isFinite(src.frameRate) || src.frameRate <= 0) return 30;
	return Math.min(120, Math.max(5, src.frameRate));
}

/**
 * Decide the audio budget. Audio is small but not free: at a 200 kbps total
 * budget, a 128 kbps AAC track would eat two thirds of the file and leave the
 * video in ruins. So audio scales with the budget and gets a hard 18% cap.
 */
function planAudio(src: SourceInfo, totalBudget: number) {
	if (!src.hasAudio) return { audioBitrate: null, audioChannels: 0, removed: false };

	// Below this, there simply isn't a file to split — video wins.
	if (totalBudget < 80_000) return { audioBitrate: null, audioChannels: 0, removed: true };

	const ladder =
		totalBudget >= 2_000_000
			? 128_000
			: totalBudget >= 1_000_000
				? 96_000
				: totalBudget >= 500_000
					? 64_000
					: totalBudget >= 250_000
						? 48_000
						: 32_000;

	const bitrate = Math.round(Math.max(24_000, Math.min(ladder, totalBudget * 0.18)));
	// Stereo below ~64 kbps is worse than mono at the same rate.
	const channels = bitrate <= 64_000 ? 1 : Math.min(2, src.audioChannels || 2);
	return { audioBitrate: bitrate, audioChannels: channels, removed: false };
}

function keyFrameIntervalFor(videoBitrate: number): number {
	// At low bitrates keyframes are expensive; space them out.
	return videoBitrate < 400_000 ? 10 : 5;
}

/**
 * Plan for "compress to at most N bytes".
 *
 * The budget is fixed by arithmetic — `targetBytes * 8 / duration`. Everything
 * else (resolution, frame rate, audio) adapts to fit inside it.
 */
export function planForTargetSize(src: SourceInfo, targetBytes: number): CompressionPlan {
	const warnings: PlanWarning[] = [];
	const duration = Math.max(src.durationSec, 0.1);

	let totalBudget = (targetBytes * 8 * MUX_OVERHEAD * TARGET_SAFETY) / duration;

	const audio = planAudio(src, totalBudget);
	if (audio.removed) warnings.push('audio_removed');

	let videoBudget = totalBudget - (audio.audioBitrate ?? 0);

	// If the source is already thinner than the budget, spending more bits
	// would only re-encode noise. Cap it and land comfortably under target.
	let cappedBySource = false;
	if (src.videoBitrate && videoBudget > src.videoBitrate) {
		videoBudget = src.videoBitrate;
		cappedBySource = true;
		if (targetBytes >= src.totalBytes) warnings.push('target_above_source');
	}

	// No MIN_VIDEO_BITRATE floor here, on purpose: "at most N MB" is a promise,
	// and a floor that quietly overshoots it would break that promise. If the
	// arithmetic says 20 kbps, we encode at 20 kbps and warn loudly.
	videoBudget = Math.max(8_000, videoBudget);

	let frameRate = normalizedFrameRate(src);
	let res: ReturnType<typeof pickResolution>;

	if (cappedBySource) {
		// We aren't squeezed by the target at all — we're just matching the
		// source's own bitrate at its own resolution, which is by definition
		// enough for it. Downscaling here would throw away detail for nothing.
		const srcShort = Math.min(src.width, src.height);
		res = { width: even(src.width), height: even(src.height), shortEdge: srcShort, belowFloor: false };
	} else {
		res = pickResolution(src.width, src.height, videoBudget, frameRate, TARGET_BPP_FLOOR, Infinity);

		// Resolution and frame rate compete for the same bits. Once we're below
		// 720p the budget is clearly tight, and 30 sharp frames beat 60 mushy
		// ones — so spend the halved frame budget on pixels instead.
		if (res.shortEdge < 720 && frameRate > 32) {
			frameRate = Math.max(24, Math.round(frameRate / 2));
			res = pickResolution(src.width, src.height, videoBudget, frameRate, TARGET_BPP_FLOOR, Infinity);
			warnings.push('framerate_reduced');
		}

		// Still under the floor at the smallest size we ladder to. Last lever:
		// cut the frame rate to a slideshow-ish 15 so each frame gets double
		// the bits. Below this there is nothing left to trade.
		if (res.belowFloor && frameRate > 15) {
			frameRate = 15;
			res = pickResolution(src.width, src.height, videoBudget, frameRate, TARGET_BPP_FLOOR, Infinity);
			if (!warnings.includes('framerate_reduced')) warnings.push('framerate_reduced');
		}
	}

	if (res.belowFloor) warnings.push('quality_will_be_poor');
	if (res.shortEdge < Math.min(src.width, src.height)) warnings.push('resolution_reduced');

	const videoBitrate = Math.round(videoBudget);

	return {
		mode: 'target',
		width: res.width,
		height: res.height,
		frameRate,
		videoBitrate,
		quantizer: null,
		audioBitrate: audio.audioBitrate,
		audioChannels: audio.audioChannels,
		keyFrameInterval: keyFrameIntervalFor(videoBitrate),
		cappedBySource,
		warnings
	};
}

/**
 * Plan for the Light / Balanced / Max squish slider.
 *
 * Here the *quality* is fixed and the size is whatever it turns out to be, so
 * we drive the encoder with a quantizer (constant quality, like x264's CRF).
 * The bitrate we compute alongside is both the fallback for encoders without
 * quantizer support and the input to the resolution decision.
 */
export function planForLevel(src: SourceInfo, level: CompressionLevel): CompressionPlan {
	const warnings: PlanWarning[] = [];
	const cfg = LEVELS[level];

	let frameRate = Math.min(normalizedFrameRate(src), cfg.fpsCap);
	if (frameRate < normalizedFrameRate(src)) warnings.push('framerate_reduced');

	// What this level ideally wants, at this level's resolution cap.
	const capped = scaleToShortEdge(
		src.width,
		src.height,
		Math.min(Math.min(src.width, src.height), cfg.maxShortEdge)
	);
	const idealBitrate = cfg.bpp * capped.width * capped.height * frameRate;

	// ...but an already-efficient source shouldn't be re-inflated, and a
	// bloated one should still shrink by a predictable fraction.
	let cappedBySource = false;
	let videoBitrate = idealBitrate;
	if (src.videoBitrate) {
		const fromSource = src.videoBitrate * cfg.sourceFactor;
		if (fromSource < videoBitrate) {
			videoBitrate = fromSource;
			cappedBySource = true;
		}
	}
	videoBitrate = Math.max(MIN_VIDEO_BITRATE, videoBitrate);

	// The bpp check again: if a heavily-compressed 1080p source drove the
	// bitrate down to 700 kbps, encoding it back out at 1080p would look
	// terrible. Drop a rung instead.
	//
	// The floor here is deliberately well below `cfg.bpp`. That value is what
	// this level *aims* for; this is the point where the picture actually
	// starts falling apart. Using the target as the floor would downscale
	// perfectly good video — a 1080p source held to 65% of its own bitrate is
	// still 1080p material, not 720p material.
	const res = pickResolution(
		src.width,
		src.height,
		videoBitrate,
		frameRate,
		cfg.bpp * 0.6,
		cfg.maxShortEdge
	);
	if (res.belowFloor) warnings.push('quality_will_be_poor');
	if (res.shortEdge < Math.min(src.width, src.height)) warnings.push('resolution_reduced');

	const totalBudgetHint = videoBitrate / 0.85;
	const audio = planAudio({ ...src, videoBitrate }, totalBudgetHint);
	if (audio.removed) warnings.push('audio_removed');

	return {
		mode: 'level',
		width: res.width,
		height: res.height,
		frameRate,
		videoBitrate: Math.round(videoBitrate),
		quantizer: cfg.quantizer,
		audioBitrate: audio.audioBitrate,
		audioChannels: audio.audioChannels,
		keyFrameInterval: keyFrameIntervalFor(videoBitrate),
		cappedBySource,
		warnings
	};
}

/**
 * After a target-size pass lands, work out the budget to retry with.
 *
 * Returns null when the result is good enough. We re-plan from a corrected
 * *byte target* rather than just scaling the bitrate, so that a large miss
 * also re-triggers the resolution decision.
 */
export function correctTargetBytes(
	previousTargetBytes: number,
	actualBytes: number,
	desiredBytes: number,
	attempt: number,
	cappedBySource: boolean
): number | null {
	if (attempt >= 3) return null;

	// Overshot — this one is mandatory, the promise is "at most N MB".
	if (actualBytes > desiredBytes) {
		return previousTargetBytes * (desiredBytes / actualBytes) * 0.96;
	}

	// Undershot badly, and not because the source ran out of bits: we're
	// leaving real quality on the table. Worth exactly one more pass.
	if (attempt === 1 && !cappedBySource && actualBytes < desiredBytes * 0.6) {
		return Math.min(desiredBytes * 0.97, previousTargetBytes * (desiredBytes / actualBytes) * 0.9);
	}

	return null;
}

/**
 * Pure planning for the video effects tool -- no browser/WebGL APIs, just
 * the style presets the shader is driven by. Kept separate from
 * videofilter.worker.ts / shader.ts so the preset numbers can be tuned or
 * unit-tested without touching any GPU code, same reasoning as
 * $lib/upscale/plan.ts.
 *
 * Two families of look live side by side in one flat list here:
 *  - "Retro / Analog" (filterFamily 0): the original VHS-style pipeline --
 *    scanlines, tracking glitches, tape dropouts, an optional burned-in
 *    timecode, etc. (the first 6 styles below.)
 *  - "Artistic" (filterFamily 1-4): a completely different rendering path
 *    per style (edge-detected pencil sketch, cross-hatch ink, false-color
 *    thermal, glowing neon edges) -- see shader.ts's renderPencil /
 *    renderCrossHatch / renderThermal / renderNeon (the last 4 styles
 *    below). These only read a handful of the fields further down
 *    (grain/vignette/scanline/bloom/chroma/edge threshold); the rest are
 *    irrelevant to them and just carry a neutral value.
 */

export type VhsStyle =
	| 'classic'
	| 'camcorder80s'
	| 'camcorder90s'
	| 'damaged'
	| 'security'
	| 'broadcast'
	| 'pencil'
	| 'crosshatch'
	| 'thermal'
	| 'neon';

export const VHS_STYLES: VhsStyle[] = [
	'classic',
	'camcorder80s',
	'camcorder90s',
	'damaged',
	'security',
	'broadcast',
	'pencil',
	'crosshatch',
	'thermal',
	'neon'
];

export type VhsParams = {
	/** Which shader code path to run -- 0 = analog VHS pipeline, 1 = pencil, 2 = cross-hatch, 3 = thermal, 4 = neon. */
	filterFamily: 0 | 1 | 2 | 3 | 4;
	/** 0-1, how dark the alternating scanlines are. */
	scanlineIntensity: number;
	/** 0-1, luma noise + white "snow" specks. */
	noiseIntensity: number;
	/** Pixels of red/blue channel split (chromatic aberration in the VHS family; edge RGB-split in neon). */
	chromaShift: number;
	/** 0-1, how much the chroma smears horizontally (NTSC color bleed). */
	colorBleed: number;
	/** 0-1, corner darkening. */
	vignetteStrength: number;
	/** Multiplier on saturation (1 = unchanged). */
	saturation: number;
	/** Multiplier on contrast (1 = unchanged). */
	contrast: number;
	/** Flat brightness offset, roughly -0.2..0.2. */
	brightness: number;
	/** -1..1, shifts the image toward warm (red/orange) tape tint. */
	warmth: number;
	/** Pixels of per-scanline horizontal jitter outside the tracking band. */
	jitterAmount: number;
	/** 0-1, how wide/violent the drifting tracking-glitch band is. */
	trackingGlitch: number;
	/** 0-1, fine grain overlay strength (paper grain in pencil/cross-hatch). */
	grainIntensity: number;
	/** 0-1 fraction of frame height eaten by head-switching static at the bottom. */
	bottomNoiseHeight: number;
	/** 0-1, how often/far the frame rolls vertically like a mistracked tape. */
	rollAmount: number;
	/** 0-1, glow strength -- highlight bloom in the VHS family, edge glow in neon. */
	bloomStrength: number;
	/** 0-1, per-line-parity micro-shimmer that reads as interlaced fields. */
	interlaceStrength: number;
	/** 0-1, random short bright horizontal streaks -- magnetic tape dropouts. */
	dropoutStrength: number;
	/** Burned-in REC-dot + running timecode, like an old camcorder overlay. */
	showTimestamp: boolean;
	/** RGB (0-1 each) of the timestamp/REC-dot text. */
	overlayColor: [number, number, number];
	/** Fraction-of-screen anchor for the timestamp, measured from bottom-left. */
	overlayPos: [number, number];
	/** 0-1, edge-detection sensitivity for the artistic filters (higher = more, fainter lines). */
	edgeThreshold: number;
	/** 0-1, warm-tinted glow bleeding around bright highlights (film halation). VHS family only. */
	halationStrength: number;
	/** 0-1, filmic split-tone grade strength -- cool shadows, warm highlights. VHS family only. */
	splitToneStrength: number;
	/** 0-1, radial lens-style chromatic aberration that grows toward the frame edges. VHS family only. */
	lensAberration: number;
	/** 0-1, soft warm light-leak streak drifting across the frame over time. VHS family only. */
	lightLeakStrength: number;
	/** 0-1, horizontal luma softness (worn-tape bandwidth loss). VHS family only. */
	softness: number;
};

const NEUTRAL_ANALOG_FIELDS = {
	saturation: 1,
	contrast: 1,
	brightness: 0,
	warmth: 0,
	jitterAmount: 0,
	trackingGlitch: 0,
	bottomNoiseHeight: 0,
	rollAmount: 0,
	interlaceStrength: 0,
	dropoutStrength: 0,
	showTimestamp: false as const,
	overlayColor: [1, 1, 1] as [number, number, number],
	overlayPos: [0.12, 0.06] as [number, number],
	colorBleed: 0,
	noiseIntensity: 0,
		halationStrength: 0,
		splitToneStrength: 0,
		lensAberration: 0,
		lightLeakStrength: 0,
		softness: 0
	};

const PRESETS: Record<VhsStyle, VhsParams> = {
	// Balanced, "generic old VHS tape" look -- the safe default.
	classic: {
		filterFamily: 0,
		scanlineIntensity: 0.18,
		noiseIntensity: 0.14,
		chromaShift: 1.6,
		colorBleed: 0.55,
		vignetteStrength: 0.28,
		saturation: 0.88,
		contrast: 1.08,
		brightness: 0.0,
		warmth: 0.18,
		jitterAmount: 1.5,
		trackingGlitch: 0.22,
		grainIntensity: 0.1,
		bottomNoiseHeight: 0.05,
		rollAmount: 0.15,
		bloomStrength: 0.18,
		interlaceStrength: 0.35,
		dropoutStrength: 0.25,
		showTimestamp: false,
		overlayColor: [1, 1, 1],
		overlayPos: [0.12, 0.06],
		edgeThreshold: 0.5,
		halationStrength: 0.35,
		splitToneStrength: 0.4,
		lensAberration: 0.3,
		lightLeakStrength: 0.15,
		softness: 0.3
	},
	// Warm, soft, heavily washed out -- an early-80s handheld camcorder tape,
	// complete with the amber burned-in timecode those decks stamped in.
	camcorder80s: {
		filterFamily: 0,
		scanlineIntensity: 0.24,
		noiseIntensity: 0.18,
		chromaShift: 1.3,
		colorBleed: 0.45,
		vignetteStrength: 0.42,
		saturation: 0.68,
		contrast: 0.95,
		brightness: 0.03,
		warmth: 0.32,
		jitterAmount: 0.9,
		trackingGlitch: 0.12,
		grainIntensity: 0.2,
		bottomNoiseHeight: 0.03,
		rollAmount: 0.06,
		bloomStrength: 0.3,
		interlaceStrength: 0.4,
		dropoutStrength: 0.3,
		showTimestamp: true,
		overlayColor: [1.0, 0.72, 0.18],
		overlayPos: [0.13, 0.07],
		edgeThreshold: 0.5,
		halationStrength: 0.5,
		splitToneStrength: 0.5,
		lensAberration: 0.35,
		lightLeakStrength: 0.3,
		softness: 0.35
	},
	// A cleaner, slightly less degraded camcorder -- later 90s consumer
	// decks, white/green timecode instead of amber.
	camcorder90s: {
		filterFamily: 0,
		scanlineIntensity: 0.18,
		noiseIntensity: 0.12,
		chromaShift: 0.9,
		colorBleed: 0.32,
		vignetteStrength: 0.3,
		saturation: 0.82,
		contrast: 1.02,
		brightness: 0.01,
		warmth: 0.12,
		jitterAmount: 0.5,
		trackingGlitch: 0.08,
		grainIntensity: 0.12,
		bottomNoiseHeight: 0.02,
		rollAmount: 0.03,
		bloomStrength: 0.16,
		interlaceStrength: 0.3,
		dropoutStrength: 0.15,
		showTimestamp: true,
		overlayColor: [0.75, 1.0, 0.78],
		overlayPos: [0.13, 0.92],
		edgeThreshold: 0.5,
		halationStrength: 0.3,
		splitToneStrength: 0.3,
		lensAberration: 0.25,
		lightLeakStrength: 0.1,
		softness: 0.25
	},
	// Heavily worn tape -- loud tracking glitches, big jitter, crushed color,
	// frequent dropouts. No timestamp: the point here is chaos, not nostalgia.
	damaged: {
		filterFamily: 0,
		scanlineIntensity: 0.45,
		noiseIntensity: 0.32,
		chromaShift: 3.4,
		colorBleed: 0.72,
		vignetteStrength: 0.32,
		saturation: 0.62,
		contrast: 1.2,
		brightness: -0.02,
		warmth: 0.08,
		jitterAmount: 4.8,
		trackingGlitch: 0.68,
		grainIntensity: 0.3,
		bottomNoiseHeight: 0.11,
		rollAmount: 0.55,
		bloomStrength: 0.1,
		interlaceStrength: 0.5,
		dropoutStrength: 0.75,
		showTimestamp: false,
		overlayColor: [1, 1, 1],
		overlayPos: [0.12, 0.06],
		edgeThreshold: 0.5,
		halationStrength: 0.2,
		splitToneStrength: 0.25,
		lensAberration: 0.45,
		lightLeakStrength: 0.35,
		softness: 0.4
	},
	// Desaturated, cold, heavy scanlines -- a CCTV/security monitor feed,
	// with the plain white corner timecode those systems burn in.
	security: {
		filterFamily: 0,
		scanlineIntensity: 0.4,
		noiseIntensity: 0.2,
		chromaShift: 0.4,
		colorBleed: 0.15,
		vignetteStrength: 0.55,
		saturation: 0.22,
		contrast: 1.15,
		brightness: -0.01,
		warmth: -0.08,
		jitterAmount: 0.3,
		trackingGlitch: 0.05,
		grainIntensity: 0.22,
		bottomNoiseHeight: 0.0,
		rollAmount: 0.0,
		bloomStrength: 0.05,
		interlaceStrength: 0.55,
		dropoutStrength: 0.0,
		showTimestamp: true,
		overlayColor: [0.92, 0.95, 0.92],
		overlayPos: [0.11, 0.92],
		edgeThreshold: 0.5,
		halationStrength: 0.1,
		splitToneStrength: 0.15,
		lensAberration: 0.15,
		lightLeakStrength: 0.0,
		softness: 0.15
	},
	// Analog broadcast / cable interference -- big color bleed and a slow
	// signal roll, but none of the tape-only artifacts (no dropouts).
	broadcast: {
		filterFamily: 0,
		scanlineIntensity: 0.3,
		noiseIntensity: 0.24,
		chromaShift: 2.2,
		colorBleed: 0.85,
		vignetteStrength: 0.22,
		saturation: 0.92,
		contrast: 1.05,
		brightness: 0.0,
		warmth: 0.04,
		jitterAmount: 0.6,
		trackingGlitch: 0.3,
		grainIntensity: 0.16,
		bottomNoiseHeight: 0.0,
		rollAmount: 0.28,
		bloomStrength: 0.22,
		interlaceStrength: 0.45,
		dropoutStrength: 0.0,
		showTimestamp: false,
		overlayColor: [1, 1, 1],
		overlayPos: [0.12, 0.06],
		edgeThreshold: 0.5,
		halationStrength: 0.4,
		splitToneStrength: 0.35,
		lensAberration: 0.3,
		lightLeakStrength: 0.2,
		softness: 0.3
	},
	// Hand-drawn pencil sketch: one-sided DoG contours + a light graphite
	// wash over bright paper (see renderPencil in shader.ts). Grain is
	// static inside the shader (paper must not flicker), so grainIntensity
	// is 0 -- the paper fiber/grain lives in renderPencil itself.
	pencil: {
		...NEUTRAL_ANALOG_FIELDS,
		filterFamily: 1,
		scanlineIntensity: 0,
		grainIntensity: 0,
		vignetteStrength: 0.2,
		bloomStrength: 0,
		chromaShift: 0,
		edgeThreshold: 0.6
	},
	// Cross-hatch ink illustration: 1-4 overlaid diagonal hatch directions,
	// density driven by local brightness -- the classic engraving look.
	crosshatch: {
		...NEUTRAL_ANALOG_FIELDS,
		filterFamily: 2,
		scanlineIntensity: 0,
		grainIntensity: 0.1,
		vignetteStrength: 0.15,
		bloomStrength: 0,
		chromaShift: 0,
		edgeThreshold: 0.5
	},
	// False-color thermal/FLIR-style heatmap from luminance.
	thermal: {
		...NEUTRAL_ANALOG_FIELDS,
		filterFamily: 3,
		scanlineIntensity: 0.25,
		grainIntensity: 0.12,
		vignetteStrength: 0.35,
		bloomStrength: 0,
		chromaShift: 0,
		edgeThreshold: 0.5
	},
	// Cyberpunk neon: glowing cyan/magenta edges on a near-black background.
	neon: {
		...NEUTRAL_ANALOG_FIELDS,
		filterFamily: 4,
		scanlineIntensity: 0.3,
		grainIntensity: 0.1,
		vignetteStrength: 0.3,
		bloomStrength: 0.5,
		chromaShift: 1.2,
		edgeThreshold: 0.6
	}
};

export function getVhsPreset(style: VhsStyle): VhsParams {
	return PRESETS[style] ?? PRESETS.classic;
}

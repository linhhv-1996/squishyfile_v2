/**
 * Minimal ambient types for gifenc -- the package ships no .d.ts of its own.
 * Only covers the exports this codebase actually uses; see
 * node_modules/gifenc/README.md for the full (untyped) API.
 */
declare module 'gifenc' {
	export type RGBColor = [number, number, number];
	export type RGBAColor = [number, number, number, number];
	export type PaletteColor = RGBColor | RGBAColor;

	export type QuantizeFormat = 'rgb565' | 'rgb444' | 'rgba4444';

	export type QuantizeOptions = {
		format?: QuantizeFormat;
		oneBitAlpha?: boolean | number;
		clearAlpha?: boolean;
		clearAlphaThreshold?: number;
		clearAlphaColor?: number;
	};

	export function quantize(
		rgba: Uint8Array | Uint8ClampedArray,
		maxColors: number,
		options?: QuantizeOptions
	): PaletteColor[];

	export function applyPalette(
		rgba: Uint8Array | Uint8ClampedArray,
		palette: PaletteColor[],
		format?: QuantizeFormat
	): Uint8Array;

	export function nearestColorIndex(
		colors: PaletteColor[],
		pixel: number[],
		distanceFn?: (a: number[], b: number[]) => number
	): number;

	export function nearestColorIndexWithDistance(
		colors: PaletteColor[],
		pixel: number[],
		distanceFn?: (a: number[], b: number[]) => number
	): [number, number];

	export function nearestColor(
		colors: PaletteColor[],
		pixel: number[],
		distanceFn?: (a: number[], b: number[]) => number
	): PaletteColor;

	export function snapColorsToPalette(
		palette: PaletteColor[],
		knownColors: PaletteColor[],
		threshold?: number
	): void;

	export function prequantize(
		rgba: Uint8Array | Uint8ClampedArray,
		options?: { roundRGB?: number; roundAlpha?: number; oneBitAlpha?: boolean | number }
	): void;

	export type GifWriteFrameOptions = {
		palette?: PaletteColor[] | null;
		first?: boolean;
		transparent?: boolean;
		transparentIndex?: number;
		/** Frame delay in milliseconds. */
		delay?: number;
		/** -1 = play once, 0 = loop forever, >0 = repeat count. */
		repeat?: number;
		colorDepth?: number;
		dispose?: number;
	};

	export type GifEncoderInstance = {
		reset(): void;
		finish(): void;
		bytes(): Uint8Array;
		bytesView(): Uint8Array;
		readonly buffer: ArrayBufferLike;
		writeFrame(
			index: Uint8Array,
			width: number,
			height: number,
			opts?: GifWriteFrameOptions
		): void;
	};

	export function GIFEncoder(opts?: { initialCapacity?: number; auto?: boolean }): GifEncoderInstance;

	export default GIFEncoder;
}

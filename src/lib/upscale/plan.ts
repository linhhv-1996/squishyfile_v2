/**
 * Pure planning for video upscaling -- no browser/WebGPU/ONNX APIs, just the
 * routing rule the tool is built around.
 *
 * Routing rule (per product spec): source video height decides the engine --
 *   <= 720p tall  -> AI path (IMDN_RTE model via onnxruntime-web) -- better
 *                    quality, slower. Worth the cost because at these
 *                    resolutions there aren't many pixels to push.
 *   >  720p tall  -> FSR path (FidelityFX Super Resolution 1.0 compute
 *                    shaders) -- much faster, and "good enough" quality-wise
 *                    once the source already has plenty of detail.
 * The scale factor (x2/x4) is a user choice, independent of which engine runs.
 */

export type UpscaleScale = 2 | 4;
export const UPSCALE_SCALES: UpscaleScale[] = [2, 4];

export type UpscaleEngine = 'ai' | 'fsr';

/** Heights above this use FSR instead of the AI (IMDN) model. */
export const AI_ENGINE_MAX_HEIGHT = 720;

export type SourceVideoInfo = {
	/** Display height in pixels (after any rotation metadata is applied). */
	height: number;
};

export type UpscalePlan = {
	engine: UpscaleEngine;
	scale: UpscaleScale;
};

export function planForSource(source: SourceVideoInfo, scale: UpscaleScale): UpscalePlan {
	return {
		engine: source.height <= AI_ENGINE_MAX_HEIGHT ? 'ai' : 'fsr',
		scale
	};
}

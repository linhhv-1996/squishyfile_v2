/**
 * Shared WebGL2 VHS-effect renderer.
 *
 * Compiles the shader once against a given canvas and re-renders a single
 * frame into it on every `render()` call. This is used from two very
 * different places -- videofilter.worker.ts (an OffscreenCanvas, one frame per
 * Mediabunny `process()` call, full source resolution) and
 * VideoFilter.svelte's live preview (a normal `<canvas>`, one frame per
 * played video frame, driven by the visible `<video>` element) -- and
 * keeping the actual GL code in one place means the live preview and the
 * exported video are guaranteed to look identical: they run the exact same
 * shader through the exact same code path, not two hand-kept-in-sync
 * copies of it.
 */
import { VHS_VERTEX_SHADER, VHS_FRAGMENT_SHADER } from './shader';
import { getVhsPreset, type VhsStyle } from './plan';

type VhsCanvas = HTMLCanvasElement | OffscreenCanvas;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
	const shader = gl.createShader(type);
	if (!shader) throw new Error('Could not create shader.');
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const info = gl.getShaderInfoLog(shader);
		gl.deleteShader(shader);
		throw new Error(`Shader compile error: ${info ?? 'unknown'}`);
	}
	return shader;
}

const UNIFORM_NAMES = [
	'uSampler',
	'uResolution',
	'uTime',
	'uSeed',
	'uScanlineIntensity',
	'uNoiseIntensity',
	'uChromaShift',
	'uColorBleed',
	'uVignetteStrength',
	'uSaturation',
	'uContrast',
	'uBrightness',
	'uWarmth',
	'uJitterAmount',
	'uTrackingGlitch',
	'uGrainIntensity',
	'uBottomNoiseHeight',
	'uRollAmount',
	'uBloomStrength',
	'uInterlaceStrength',
	'uDropoutStrength',
	'uShowTimestamp',
	'uOverlayColor',
	'uOverlayPos',
	'uFilterFamily',
	'uEdgeThreshold'
] as const;

// Golden-ratio increments give a per-frame seed sequence that never repeats
// in a short, visually obvious cycle (unlike e.g. frameIndex / N).
const GOLDEN_RATIO_CONJUGATE = 0.6180339887498949;

export class VhsRenderer {
	private gl: WebGL2RenderingContext;
	private texture: WebGLTexture;
	private uniforms: Record<string, WebGLUniformLocation | null> = {};
	private width = 0;
	private height = 0;
	private seedAccum = 0;

	constructor(private canvas: VhsCanvas) {
		const gl = canvas.getContext('webgl2', {
			antialias: false,
			alpha: false,
			premultipliedAlpha: false,
			preserveDrawingBuffer: false
		}) as WebGL2RenderingContext | null;
		if (!gl) throw new Error('WebGL2 is not available in this browser.');
		this.gl = gl;

		const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VHS_VERTEX_SHADER);
		const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, VHS_FRAGMENT_SHADER);
		const program = gl.createProgram();
		if (!program) throw new Error('Could not create WebGL program.');
		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			const info = gl.getProgramInfoLog(program);
			throw new Error(`Program link error: ${info ?? 'unknown'}`);
		}
		gl.deleteShader(vertexShader);
		gl.deleteShader(fragmentShader);

		// Fullscreen triangle needs no attributes (built from gl_VertexID in
		// the vertex shader), but WebGL2 still wants a VAO bound to draw.
		gl.bindVertexArray(gl.createVertexArray());

		const texture = gl.createTexture();
		if (!texture) throw new Error('Could not create WebGL texture.');
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		// Standard flip so a normally top-down-stored frame ends up
		// right-side up once sampled with the bottom-left-origin uv the
		// fullscreen-triangle trick produces.
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
		this.texture = texture;

		for (const name of UNIFORM_NAMES) {
			this.uniforms[name] = gl.getUniformLocation(program, name);
		}

		gl.useProgram(program);
		gl.uniform1i(this.uniforms.uSampler, 0);
	}

	/** Renders one frame of `source` through the VHS shader into the canvas. */
	render(source: TexImageSource, width: number, height: number, style: VhsStyle, time: number): VhsCanvas {
		const { gl } = this;
		if (this.width !== width || this.height !== height) {
			this.canvas.width = width;
			this.canvas.height = height;
			gl.viewport(0, 0, width, height);
			this.width = width;
			this.height = height;
		}

		const preset = getVhsPreset(style);
		this.seedAccum = (this.seedAccum + GOLDEN_RATIO_CONJUGATE) % 1;

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

		gl.uniform1f(this.uniforms.uTime, time);
		gl.uniform1f(this.uniforms.uSeed, this.seedAccum);
		gl.uniform2f(this.uniforms.uResolution, width, height);
		gl.uniform1f(this.uniforms.uScanlineIntensity, preset.scanlineIntensity);
		gl.uniform1f(this.uniforms.uNoiseIntensity, preset.noiseIntensity);
		gl.uniform1f(this.uniforms.uChromaShift, preset.chromaShift);
		gl.uniform1f(this.uniforms.uColorBleed, preset.colorBleed);
		gl.uniform1f(this.uniforms.uVignetteStrength, preset.vignetteStrength);
		gl.uniform1f(this.uniforms.uSaturation, preset.saturation);
		gl.uniform1f(this.uniforms.uContrast, preset.contrast);
		gl.uniform1f(this.uniforms.uBrightness, preset.brightness);
		gl.uniform1f(this.uniforms.uWarmth, preset.warmth);
		gl.uniform1f(this.uniforms.uJitterAmount, preset.jitterAmount);
		gl.uniform1f(this.uniforms.uTrackingGlitch, preset.trackingGlitch);
		gl.uniform1f(this.uniforms.uGrainIntensity, preset.grainIntensity);
		gl.uniform1f(this.uniforms.uBottomNoiseHeight, preset.bottomNoiseHeight);
		gl.uniform1f(this.uniforms.uRollAmount, preset.rollAmount);
		gl.uniform1f(this.uniforms.uBloomStrength, preset.bloomStrength);
		gl.uniform1f(this.uniforms.uInterlaceStrength, preset.interlaceStrength);
		gl.uniform1f(this.uniforms.uDropoutStrength, preset.dropoutStrength);
		gl.uniform1f(this.uniforms.uShowTimestamp, preset.showTimestamp ? 1 : 0);
		gl.uniform3f(this.uniforms.uOverlayColor, ...preset.overlayColor);
		gl.uniform2f(this.uniforms.uOverlayPos, ...preset.overlayPos);
		gl.uniform1i(this.uniforms.uFilterFamily, preset.filterFamily);
		gl.uniform1f(this.uniforms.uEdgeThreshold, preset.edgeThreshold);

		gl.drawArrays(gl.TRIANGLES, 0, 3);
		return this.canvas;
	}
}

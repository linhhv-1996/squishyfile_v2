/**
 * WebGL2 fullscreen-pass shader for the video effects tool.
 *
 * Deliberately WebGL2 (not WebGPU, unlike $lib/upscale/fsr-shaders.ts) --
 * this is a single fragment-shader pass over one frame at a time, so the
 * extra ceremony of a compute pipeline buys nothing here, and WebGL2 has
 * broader support. Both shaders are compiled once and reused for every
 * frame of the video by $lib/vhs/gl-renderer.ts.
 *
 * No vertex buffer is used -- the vertex shader builds a single
 * screen-covering triangle straight from gl_VertexID (the classic
 * "fullscreen triangle" trick), so drawArrays(TRIANGLES, 0, 3) with an
 * empty VAO is enough.
 *
 * The fragment shader dispatches on uFilterFamily between two very
 * different rendering styles:
 *  - 0: the original analog VHS/camcorder/CCTV pipeline (renderVhsFamily).
 *  - 1-4: independent, structurally different "artistic" filters --
 *    pencil sketch, cross-hatch engraving, thermal false-color, and neon
 *    edge-glow -- each its own function, sharing only generic helpers
 *    (lumaOf, sobelEdge, hash11/hash12, sampleColor) and a handful of
 *    generic uniforms (grain/vignette/scanline/bloom/chromaShift) so the
 *    style-preset shape in $lib/vhs/plan.ts stays uniform.
 */

export const VHS_VERTEX_SHADER = `#version 300 es
out vec2 vUv;
void main() {
	vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
	gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
	vUv = pos;
}
`;

export const VHS_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSampler;
uniform vec2 uResolution;
uniform float uTime;
uniform float uSeed;

uniform float uScanlineIntensity;
uniform float uNoiseIntensity;
uniform float uChromaShift;
uniform float uColorBleed;
uniform float uVignetteStrength;
uniform float uSaturation;
uniform float uContrast;
uniform float uBrightness;
uniform float uWarmth;
uniform float uJitterAmount;
uniform float uTrackingGlitch;
uniform float uGrainIntensity;
uniform float uBottomNoiseHeight;
uniform float uRollAmount;
uniform float uBloomStrength;
uniform float uInterlaceStrength;
uniform float uDropoutStrength;
uniform float uShowTimestamp;
uniform vec3 uOverlayColor;
uniform vec2 uOverlayPos;
uniform int uFilterFamily;
uniform float uEdgeThreshold;

float hash11(float p) {
	p = fract(p * 0.1031);
	p *= p + 33.33;
	p *= p + p;
	return fract(p);
}

float hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

vec3 sampleColor(vec2 uv) {
	return texture(uSampler, clamp(uv, 0.0, 1.0)).rgb;
}

float lumaOf(vec3 c) {
	return dot(c, vec3(0.299, 0.587, 0.114));
}

// 3x3 Sobel edge detector on luminance -- the shared building block for the
// pencil, cross-hatch and neon "artistic" filters below. texel is the
// sample step (usually 1-2 source pixels).
float sobelEdge(vec2 uv, vec2 texel) {
	float tl = lumaOf(sampleColor(uv + vec2(-texel.x, texel.y)));
	float t = lumaOf(sampleColor(uv + vec2(0.0, texel.y)));
	float tr = lumaOf(sampleColor(uv + vec2(texel.x, texel.y)));
	float l = lumaOf(sampleColor(uv + vec2(-texel.x, 0.0)));
	float r = lumaOf(sampleColor(uv + vec2(texel.x, 0.0)));
	float bl = lumaOf(sampleColor(uv + vec2(-texel.x, -texel.y)));
	float b = lumaOf(sampleColor(uv + vec2(0.0, -texel.y)));
	float br = lumaOf(sampleColor(uv + vec2(texel.x, -texel.y)));

	float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
	float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
	return length(vec2(gx, gy));
}

// ---------------------------------------------------------------------
// Tiny procedural 3x5 "LCD" font -- just enough to burn a HH:MM:SS
// timecode and a REC dot into the corner like an old camcorder/CCTV
// overlay. Each digit is 5 rows of a 3-bit mask (bit2=left..bit0=right).
// ---------------------------------------------------------------------
int digitRowBits(int d, int row) {
	if (d == 0) { if (row == 0) return 7; if (row == 1) return 5; if (row == 2) return 5; if (row == 3) return 5; return 7; }
	if (d == 1) { if (row == 0) return 2; if (row == 1) return 6; if (row == 2) return 2; if (row == 3) return 2; return 7; }
	if (d == 2) { if (row == 0) return 7; if (row == 1) return 1; if (row == 2) return 7; if (row == 3) return 4; return 7; }
	if (d == 3) { if (row == 0) return 7; if (row == 1) return 1; if (row == 2) return 7; if (row == 3) return 1; return 7; }
	if (d == 4) { if (row == 0) return 5; if (row == 1) return 5; if (row == 2) return 7; if (row == 3) return 1; return 1; }
	if (d == 5) { if (row == 0) return 7; if (row == 1) return 4; if (row == 2) return 7; if (row == 3) return 1; return 7; }
	if (d == 6) { if (row == 0) return 7; if (row == 1) return 4; if (row == 2) return 7; if (row == 3) return 5; return 7; }
	if (d == 7) { if (row == 0) return 7; if (row == 1) return 1; if (row == 2) return 2; if (row == 3) return 2; return 2; }
	if (d == 8) { if (row == 0) return 7; if (row == 1) return 5; if (row == 2) return 7; if (row == 3) return 5; return 7; }
	if (row == 0) return 7; if (row == 1) return 5; if (row == 2) return 7; if (row == 3) return 1; return 7; // 9
}

float drawGlyph(vec2 local, int d) {
	if (local.x < 0.0 || local.x >= 1.0 || local.y < 0.0 || local.y >= 1.0) return 0.0;
	int col = clamp(int(local.x * 3.0), 0, 2);
	// The fullscreen-triangle uv this shader uses has v=0 at the BOTTOM of
	// the screen (see the vertex shader), so reading local.y*5.0 directly
	// would walk glyph rows bottom-to-top. Flip it here so digitRowBits'
	// row 0 (authored top-to-bottom, like reading text) lands at the top.
	int row = 4 - clamp(int(local.y * 5.0), 0, 4);
	if (d < 0) {
		// colon: two centered dots
		return (col == 1 && (row == 1 || row == 3)) ? 1.0 : 0.0;
	}
	int rowBits = digitRowBits(d, row);
	return float((rowBits >> (2 - col)) & 1);
}

// Returns how much of this pixel is covered by the timestamp/REC overlay.
float overlayCoverage(vec2 fragPx) {
	vec2 anchor = uOverlayPos * uResolution;
	float glyphH = uResolution.y * 0.032;
	float glyphW = glyphH * 0.62;
	float gap = glyphH * 0.22;
	float advance = glyphW + gap;

	int totalSeconds = int(uTime);
	int hh = (totalSeconds / 3600);
	int mm = (totalSeconds / 60) % 60;
	int ss = totalSeconds % 60;
	int digits[8];
	digits[0] = (hh / 10) % 10;
	digits[1] = hh % 10;
	digits[2] = -1;
	digits[3] = mm / 10;
	digits[4] = mm % 10;
	digits[5] = -1;
	digits[6] = ss / 10;
	digits[7] = ss % 10;

	float coverage = 0.0;
	for (int i = 0; i < 8; i++) {
		vec2 local = vec2((fragPx.x - (anchor.x + float(i) * advance)) / glyphW, (fragPx.y - anchor.y) / glyphH);
		coverage = max(coverage, drawGlyph(local, digits[i]));
	}

	// Blinking REC dot to the left of the timecode.
	float blink = step(0.5, fract(uTime));
	vec2 recCenter = anchor + vec2(-glyphH * 0.85, glyphH * 0.5);
	float recDist = length(fragPx - recCenter);
	float recDot = smoothstep(glyphH * 0.3, glyphH * 0.22, recDist) * blink;
	coverage = max(coverage, recDot);

	return coverage;
}

// ---------------------------------------------------------------------
// Filter family 0: the analog VHS/camcorder/CCTV pipeline (unchanged from
// the original single-purpose shader -- just relocated into its own
// function so main() can dispatch between it and the newer artistic
// filters below).
// ---------------------------------------------------------------------
vec3 renderVhsFamily(vec2 startUv) {
	vec2 uv = startUv;
	float px = 1.0 / uResolution.x;
	float py = 1.0 / uResolution.y;

	// Vertical roll: a slow, wrapping vertical offset that occasionally
	// sweeps through the frame -- a VCR losing vertical sync for a beat.
	float rollCycle = fract(uTime * 0.05 + uSeed * 0.37);
	float rollPulse = smoothstep(0.96, 1.0, rollCycle) + smoothstep(0.04, 0.0, rollCycle);
	uv.y = fract(uv.y + uRollAmount * rollPulse * 0.6);

	// Tracking glitch band: a horizontal band drifts down the frame over
	// time. Rows inside it get large random horizontal jitter, rows
	// outside get much smaller jitter -- the classic "bad tracking" look.
	float bandCenter = fract(uTime * 0.09 + hash11(floor(uTime * 1.7)) * 0.5);
	float bandWidth = mix(0.02, 0.12, uTrackingGlitch);
	float inBand = smoothstep(bandWidth, 0.0, abs(uv.y - bandCenter));

	float lineId = floor(uv.y * uResolution.y * 0.5);
	float lineRand = hash11(lineId + floor(uTime * 24.0));
	float baseJitter = (lineRand - 0.5) * 2.0 * uJitterAmount * px;
	float glitchRand = hash11(lineId * 1.37 + floor(uTime * 60.0));
	float glitchJitter = (glitchRand - 0.5) * 2.0 * uJitterAmount * 10.0 * px;
	uv.x = fract(uv.x + mix(baseJitter, glitchJitter, inBand * uTrackingGlitch));

	// Interlacing: real interlaced video draws odd/even lines from two
	// time-offset fields, which shows up as a faint per-line-parity
	// shimmer/combing on anything with motion. A tiny alternating
	// horizontal shift per scanline parity fakes that cheaply.
	float lineParity = mod(floor(uv.y * uResolution.y), 2.0);
	uv.x = fract(uv.x + (lineParity - 0.5) * 2.0 * uInterlaceStrength * 1.4 * px);

	// Chromatic aberration: split channels horizontally.
	float shift = uChromaShift * px;
	vec3 col;
	col.r = sampleColor(uv + vec2(shift, 0.0)).r;
	col.g = sampleColor(uv).g;
	col.b = sampleColor(uv - vec2(shift, 0.0)).b;

	// Color bleed: smear chroma (not luma) horizontally, mimicking NTSC
	// composite artifacts where color info has far less bandwidth than
	// brightness.
	vec3 bleed = vec3(0.0);
	float bleedSpread = mix(1.0, 6.0, uColorBleed) * px;
	float bleedWeightSum = 0.0;
	for (int i = 0; i < 5; i++) {
		float t = float(i) / 4.0;
		float o = (t - 0.5) * 2.0 * bleedSpread;
		float w = 1.0 - abs(t - 0.5) * 2.0;
		bleed += sampleColor(uv + vec2(o, 0.0)) * w;
		bleedWeightSum += w;
	}
	bleed /= max(bleedWeightSum, 0.0001);
	float luma = dot(col, vec3(0.299, 0.587, 0.114));
	float bleedLuma = dot(bleed, vec3(0.299, 0.587, 0.114));
	vec3 chroma = mix(col - luma, bleed - bleedLuma, uColorBleed);
	col = luma + chroma;

	// Soft bloom: cheap 4-tap blur, added back only on bright areas for a
	// glowing-highlight camcorder feel.
	vec3 blur = vec3(0.0);
	blur += sampleColor(uv + vec2(2.0 * px, 0.0));
	blur += sampleColor(uv - vec2(2.0 * px, 0.0));
	blur += sampleColor(uv + vec2(0.0, 2.0 * py));
	blur += sampleColor(uv - vec2(0.0, 2.0 * py));
	blur *= 0.25;
	col += blur * smoothstep(0.6, 1.0, dot(blur, vec3(0.299, 0.587, 0.114))) * uBloomStrength;

	// Tape dropouts: rare, short, bright horizontal streak segments on a
	// scattered line that flicker in and out per frame -- the classic
	// magnetic-tape "dropout" artifact, distinct from generic grain.
	if (uDropoutStrength > 0.0) {
		float dLine = floor(uv.y * uResolution.y);
		float frameId = floor(uTime * 30.0);
		float roll = hash11(dLine * 7.13 + frameId);
		float dropoutActive = step(1.0 - uDropoutStrength * 0.05, roll);
		if (dropoutActive > 0.0) {
			float segStart = hash11(dLine * 3.7 + frameId + 11.0);
			float segLen = mix(0.05, 0.3, hash11(dLine * 9.1 + frameId));
			float inSeg = step(segStart, uv.x) * step(uv.x, segStart + segLen);
			col = mix(col, vec3(1.0), inSeg * dropoutActive * 0.85);
		}
	}

	// Scanlines with a slow, subtle flicker.
	float scanline = sin(uv.y * uResolution.y * 3.14159265);
	float flicker = 0.94 + 0.06 * sin(uTime * 18.0 + uSeed * 6.2831);
	col *= 1.0 - uScanlineIntensity * (0.5 + 0.5 * scanline) * flicker;

	// Grain + occasional bright "snow" specks.
	float n = hash12(uv * uResolution + vec2(uSeed * 173.1, uTime * 97.3));
	col += (n - 0.5) * uGrainIntensity;
	float snowChance = hash12(uv * uResolution * 0.5 + vec2(uTime * 53.7, uSeed * 211.0));
	col += vec3(step(0.997, snowChance) * uNoiseIntensity * 6.0);

	// Head-switching noise band at the very bottom of the frame -- the
	// strip of static real VHS decks show where the playback head
	// switches tracks.
	float bottomAmt = smoothstep(1.0 - uBottomNoiseHeight, 1.0, uv.y);
	if (bottomAmt > 0.0) {
		float bandNoise = hash12(vec2(floor(uv.x * uResolution.x * 0.5), uTime * 240.0));
		col = mix(col, vec3(bandNoise), bottomAmt);
	}

	// Vignette.
	vec2 centered = uv - 0.5;
	float vignette = 1.0 - uVignetteStrength * dot(centered, centered) * 2.0;
	col *= clamp(vignette, 0.0, 1.0);

	// Color grade: saturation, contrast, brightness, warm tape tint.
	float gray = dot(col, vec3(0.299, 0.587, 0.114));
	col = mix(vec3(gray), col, uSaturation);
	col = (col - 0.5) * uContrast + 0.5 + uBrightness;
	col.r += uWarmth * 0.06;
	col.b -= uWarmth * 0.06;
	col = clamp(col, 0.0, 1.0);

	// Burned-in REC/timecode overlay, drawn last so grading doesn't touch
	// it -- it's a separate signal layer on the real thing, too.
	if (uShowTimestamp > 0.5) {
		float coverage = overlayCoverage(startUv * uResolution);
		col = mix(col, uOverlayColor, coverage * 0.92);
	}

	return col;
}

// ---------------------------------------------------------------------
// Filter family 1: pencil sketch -- Sobel-edge outlines plus diagonal
// hatch shading in the shadows, composited onto a paper tone.
// ---------------------------------------------------------------------
vec3 renderPencil(vec2 uv) {
	vec2 texel = vec2(1.0 / uResolution.x, 1.0 / uResolution.y);
	vec3 src = sampleColor(uv);
	float srcLuma = lumaOf(src);

	float edge = sobelEdge(uv, texel * 1.5);
	float threshold = mix(0.15, 0.7, uEdgeThreshold);
	float ink = smoothstep(threshold * 0.4, threshold, edge);

	// Diagonal hatch strokes fill in the darker midtones/shadows, like an
	// artist shading rather than just tracing outlines.
	vec2 fragPx = uv * uResolution;
	float hatch1 = step(mod(fragPx.x + fragPx.y, 6.0), 1.4);
	float hatch2 = step(mod(fragPx.x - fragPx.y, 6.0), 1.4);
	float shadow = 1.0 - smoothstep(0.15, 0.6, srcLuma);
	float hatching = max(hatch1 * step(0.35, shadow), hatch2 * step(0.7, shadow));

	float mark = clamp(ink + hatching * 0.8, 0.0, 1.0);

	// Paper tone: a soft, slightly noisy near-white with corner darkening.
	float paperNoise = hash12(uv * uResolution * 0.8 + uSeed * 91.0) * 0.06;
	float paperTone = 0.94 - paperNoise;
	vec2 centered = uv - 0.5;
	paperTone -= uVignetteStrength * dot(centered, centered);

	vec3 paper = vec3(paperTone);
	vec3 inkColor = vec3(0.08, 0.08, 0.1);
	vec3 col = mix(paper, inkColor, mark);

	float grain = (hash12(uv * uResolution + vec2(uSeed * 57.0, uTime * 41.0)) - 0.5) * uGrainIntensity;
	col += grain;

	return col;
}

// ---------------------------------------------------------------------
// Filter family 2: cross-hatch engraving -- up to four overlaid diagonal
// line directions, each gated on by local darkness, the classic
// woodcut/etching shading technique.
// ---------------------------------------------------------------------
vec3 renderCrossHatch(vec2 uv) {
	vec3 src = sampleColor(uv);
	float shade = 1.0 - lumaOf(src);
	vec2 fragPx = uv * uResolution;

	float spacing = mix(3.0, 7.0, uEdgeThreshold);
	float h0 = step(mod(fragPx.y, spacing), 1.2) * step(0.12, shade);
	float h45 = step(mod(fragPx.x + fragPx.y, spacing), 1.2) * step(0.35, shade);
	float h90 = step(mod(fragPx.x, spacing), 1.2) * step(0.58, shade);
	float h135 = step(mod(fragPx.x - fragPx.y, spacing), 1.2) * step(0.8, shade);

	float mark = clamp(h0 + h45 + h90 + h135, 0.0, 1.0);

	float paperNoise = hash12(uv * uResolution * 0.8 + uSeed * 63.0) * 0.05;
	vec3 paper = vec3(0.97 - paperNoise, 0.95 - paperNoise, 0.9 - paperNoise);
	vec3 inkColor = vec3(0.05, 0.05, 0.08);
	vec3 col = mix(paper, inkColor, mark);

	vec2 centered = uv - 0.5;
	col *= 1.0 - uVignetteStrength * dot(centered, centered);

	float grain = (hash12(uv * uResolution + vec2(uSeed * 29.0, uTime * 19.0)) - 0.5) * uGrainIntensity;
	col += grain;

	return col;
}

// Piecewise-linear false-color ramp for the thermal filter: black/purple
// (cold) through red/orange (mid) to pale yellow (hot).
vec3 thermalRamp(float t) {
	t = clamp(t, 0.0, 1.0);
	vec3 c0 = vec3(0.02, 0.0, 0.08);
	vec3 c1 = vec3(0.35, 0.0, 0.55);
	vec3 c2 = vec3(0.85, 0.1, 0.1);
	vec3 c3 = vec3(1.0, 0.55, 0.0);
	vec3 c4 = vec3(1.0, 0.95, 0.5);
	if (t < 0.25) return mix(c0, c1, t / 0.25);
	if (t < 0.5) return mix(c1, c2, (t - 0.25) / 0.25);
	if (t < 0.75) return mix(c2, c3, (t - 0.5) / 0.25);
	return mix(c3, c4, (t - 0.75) / 0.25);
}

// ---------------------------------------------------------------------
// Filter family 3: thermal/FLIR-style false color, remapped straight from
// source luminance through thermalRamp, with scanlines/grain/vignette
// reused from the analog toolkit to sell it as a "monitor feed".
// ---------------------------------------------------------------------
vec3 renderThermal(vec2 uv) {
	vec3 src = sampleColor(uv);
	float heat = lumaOf(src);
	vec3 col = thermalRamp(heat);

	float scanline = sin(uv.y * uResolution.y * 3.14159265);
	col *= 1.0 - uScanlineIntensity * (0.5 + 0.5 * scanline);

	float grain = (hash12(uv * uResolution + vec2(uSeed * 173.1, uTime * 97.3)) - 0.5) * uGrainIntensity;
	col += grain;

	vec2 centered = uv - 0.5;
	col *= clamp(1.0 - uVignetteStrength * dot(centered, centered) * 2.0, 0.0, 1.0);

	return col;
}

// ---------------------------------------------------------------------
// Filter family 4: cyberpunk neon -- Sobel edges sampled with a per-
// channel horizontal offset (reusing uChromaShift) for a chromatic edge
// split, glowing on a near-black cyan/magenta duotone base.
// ---------------------------------------------------------------------
vec3 renderNeon(vec2 uv) {
	vec2 texel = vec2(1.0 / uResolution.x, 1.0 / uResolution.y);
	float shift = uChromaShift * texel.x;

	float edgeR = sobelEdge(uv + vec2(shift, 0.0), texel);
	float edgeG = sobelEdge(uv, texel);
	float edgeB = sobelEdge(uv - vec2(shift, 0.0), texel);

	float threshold = mix(0.1, 0.5, uEdgeThreshold);
	vec3 edgeCol = vec3(
		smoothstep(threshold * 0.3, threshold, edgeR),
		smoothstep(threshold * 0.3, threshold, edgeG),
		smoothstep(threshold * 0.3, threshold, edgeB)
	);
	float edgeMax = max(edgeCol.r, max(edgeCol.g, edgeCol.b));

	float srcLuma = lumaOf(sampleColor(uv));
	vec3 duotone = mix(vec3(0.05, 0.0, 0.15), vec3(0.0, 0.95, 1.0), srcLuma);
	vec3 magenta = vec3(1.0, 0.1, 0.85);

	vec3 glowLine = mix(duotone * 0.4, magenta, edgeCol.r) * edgeMax;
	vec3 col = duotone * 0.12 + glowLine;

	// Bloom: blur the edge signal itself so bright edges glow into their
	// neighborhood rather than staying pin-sharp.
	float bloom = 0.0;
	bloom += sobelEdge(uv + vec2(2.0 * texel.x, 0.0), texel);
	bloom += sobelEdge(uv - vec2(2.0 * texel.x, 0.0), texel);
	bloom += sobelEdge(uv + vec2(0.0, 2.0 * texel.y), texel);
	bloom += sobelEdge(uv - vec2(0.0, 2.0 * texel.y), texel);
	bloom *= 0.25;
	col += vec3(0.1, 0.7, 1.0) * smoothstep(threshold * 0.5, threshold * 1.5, bloom) * uBloomStrength;

	float scanline = sin(uv.y * uResolution.y * 3.14159265);
	col *= 1.0 - uScanlineIntensity * (0.5 + 0.5 * scanline);

	float grain = (hash12(uv * uResolution + vec2(uSeed * 173.1, uTime * 97.3)) - 0.5) * uGrainIntensity;
	col += grain;

	vec2 centered = uv - 0.5;
	col *= clamp(1.0 - uVignetteStrength * dot(centered, centered) * 2.0, 0.0, 1.0);

	return col;
}

void main() {
	vec3 col;
	if (uFilterFamily == 0) {
		col = renderVhsFamily(vUv);
	} else if (uFilterFamily == 1) {
		col = renderPencil(vUv);
	} else if (uFilterFamily == 2) {
		col = renderCrossHatch(vUv);
	} else if (uFilterFamily == 3) {
		col = renderThermal(vUv);
	} else {
		col = renderNeon(vUv);
	}
	fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

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
uniform float uSoftness;
uniform float uHalationStrength;
uniform float uSplitToneStrength;
uniform float uLensAberration;
uniform float uLightLeakStrength;

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

// 3x3 Sobel edge detector on luminance -- the shared building block for
// the pencil, cross-hatch and neon "artistic" filters below. texel is the
// sample step (pencil passes a ~2px step so pixel-level texture noise is
// skipped while real shape boundaries still respond).
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

// Returns (text/REC-dot coverage, backing-box coverage) for the
// timestamp overlay. The box is a soft dark rectangle drawn *behind* the
// text -- a bare color badly blends into bright or busy footage, which is
// exactly what real camcorder/CCTV on-screen text avoids with this kind
// of dark backing.
vec2 overlayCoverage(vec2 fragPx) {
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

	// Backing box spanning from the REC dot to the last digit, with a
	// little padding and soft (anti-aliased) edges.
	float padH = glyphH * 0.35;
	float padV = glyphH * 0.3;
	float edgeSoft = glyphH * 0.15;
	float boxLeft = anchor.x - glyphH * 1.15 - padH;
	float boxRight = anchor.x + 7.0 * advance + glyphW + padH;
	float boxBottom = anchor.y - padV;
	float boxTop = anchor.y + glyphH + padV;
	float boxX = smoothstep(boxLeft - edgeSoft, boxLeft, fragPx.x) * (1.0 - smoothstep(boxRight, boxRight + edgeSoft, fragPx.x));
	float boxY = smoothstep(boxBottom - edgeSoft, boxBottom, fragPx.y) * (1.0 - smoothstep(boxTop, boxTop + edgeSoft, fragPx.y));
	float boxCoverage = boxX * boxY;

	return vec2(coverage, boxCoverage);
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
	// Resolution compensation: most artifact sizes below are authored in
	// source pixels at ~480p (where they were eyeballed). Without this, the
	// same 1px grain / 1.6px chroma split / 2px scanlines shrink into
	// invisibility on HD footage -- and whatever survives gets eaten by the
	// encoder -- so HD output looks "too smooth" next to the punchy 480p
	// preview. resK keeps the look identical at any height. Clamped so tiny
	// previews don't lose all texture and 4K doesn't grow comedy-sized
	// artifacts. Deliberately NOT applied to the scanline period (a 2px
	// grille is correct at any res) or fractional quantities.
	float resK = clamp(uResolution.y / 480.0, 1.0, 3.0);

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
	float baseJitter = (lineRand - 0.5) * 2.0 * uJitterAmount * px * resK;
	float glitchRand = hash11(lineId * 1.37 + floor(uTime * 60.0));
	float glitchJitter = (glitchRand - 0.5) * 2.0 * uJitterAmount * 10.0 * px * resK;
	uv.x = fract(uv.x + mix(baseJitter, glitchJitter, inBand * uTrackingGlitch));

	// Interlacing: real interlaced video draws odd/even lines from two
	// time-offset fields, which shows up as a faint per-line-parity
	// shimmer/combing on anything with motion. A tiny alternating
	// horizontal shift per scanline parity fakes that cheaply.
	float lineParity = mod(floor(uv.y * uResolution.y), 2.0);
	uv.x = fract(uv.x + (lineParity - 0.5) * 2.0 * uInterlaceStrength * 1.4 * px * resK);

	// Chromatic aberration: split channels horizontally.
	float shift = uChromaShift * px * resK;
	vec3 col;
	col.r = sampleColor(uv + vec2(shift, 0.0)).r;
	col.g = sampleColor(uv).g;
	col.b = sampleColor(uv - vec2(shift, 0.0)).b;

	// Lens-style chromatic aberration: grows toward the frame edges like a
	// cheap camera lens, independent of the constant horizontal tape-chroma
	// split above -- this is what reads as "cinematic glass" rather than
	// "broken cable".
	if (uLensAberration > 0.0) {
		vec2 lensCentered = uv - 0.5;
		vec2 lensDir = lensCentered * uLensAberration * 0.03;
		col.r = mix(col.r, sampleColor(uv + lensDir).r, uLensAberration);
		col.b = mix(col.b, sampleColor(uv - lensDir).b, uLensAberration);
	}

	// Analog softness: a real VHS deck resolves roughly 240 horizontal
	// lines, so the picture is never pixel-sharp. A slight horizontal luma
	// blur (chroma untouched) takes the digital edge off without smearing
	// color -- this plus the color bleed below is most of what reads as
	// "analog" versus "a digital video with scanlines drawn over it".
	if (uSoftness > 0.0) {
		vec3 softAvg = (sampleColor(uv + vec2(1.5 * px * resK, 0.0)) + sampleColor(uv - vec2(1.5 * px * resK, 0.0))) * 0.5;
		float sharpLuma = lumaOf(col);
		float softLuma = lumaOf(softAvg);
		col = vec3(mix(sharpLuma, softLuma, uSoftness)) + (col - sharpLuma);
	}

	// Color bleed: smear chroma (not luma) horizontally, mimicking NTSC
	// composite artifacts where color info has far less bandwidth than
	// brightness.
	vec3 bleed = vec3(0.0);
	float bleedSpread = mix(1.0, 6.0, uColorBleed) * px * resK;
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
	blur += sampleColor(uv + vec2(2.0 * px * resK, 0.0));
	blur += sampleColor(uv - vec2(2.0 * px * resK, 0.0));
	blur += sampleColor(uv + vec2(0.0, 2.0 * py * resK));
	blur += sampleColor(uv - vec2(0.0, 2.0 * py * resK));
	blur *= 0.25;
	col += blur * smoothstep(0.6, 1.0, dot(blur, vec3(0.299, 0.587, 0.114))) * uBloomStrength;

	// Halation: a wider, warm-tinted glow around the brightest highlights --
	// the reddish-orange bleed real film stock shows around light sources,
	// distinct from the neutral bloom above.
	if (uHalationStrength > 0.0) {
		vec3 wideBlur = vec3(0.0);
		wideBlur += sampleColor(uv + vec2(5.0 * px * resK, 0.0));
		wideBlur += sampleColor(uv - vec2(5.0 * px * resK, 0.0));
		wideBlur += sampleColor(uv + vec2(0.0, 5.0 * py * resK));
		wideBlur += sampleColor(uv - vec2(0.0, 5.0 * py * resK));
		wideBlur *= 0.25;
		float halationMask = smoothstep(0.55, 1.0, dot(wideBlur, vec3(0.299, 0.587, 0.114)));
		col += vec3(1.0, 0.5, 0.22) * halationMask * uHalationStrength * 0.6;
	}

	// Light leak: a soft warm streak drifting in from one edge over time,
	// like light bleeding into the camera or tape housing.
	if (uLightLeakStrength > 0.0) {
		float leakPhase = uTime * 0.035 + uSeed * 5.1;
		vec2 leakDir = normalize(vec2(cos(leakPhase), sin(leakPhase * 0.7) * 0.6 - 0.3));
		float leakAxis = dot(startUv - 0.5, leakDir) + 0.5;
		float leak = pow(clamp(leakAxis, 0.0, 1.0), 3.0);
		col += vec3(1.0, 0.55, 0.2) * leak * uLightLeakStrength * 0.4;
	}

	// Tape dropouts: brief signal loss on a scattered line -- a dark,
	// desaturated streak segment, not a bright flash. Real dropouts are
	// missing signal (dark + colorless), which is why the old pure-white
	// streaks read as fake.
	if (uDropoutStrength > 0.0) {
		float dLine = floor(uv.y * uResolution.y);
		float frameId = floor(uTime * 30.0);
		float roll = hash11(dLine * 7.13 + frameId);
		float dropoutActive = step(1.0 - uDropoutStrength * 0.05, roll);
		if (dropoutActive > 0.0) {
			float segStart = hash11(dLine * 3.7 + frameId + 11.0);
			float segLen = mix(0.05, 0.3, hash11(dLine * 9.1 + frameId));
			float inSeg = step(segStart, uv.x) * step(uv.x, segStart + segLen);
			float dropK = inSeg * dropoutActive * 0.75;
			col = mix(col, vec3(lumaOf(col) * 0.25), dropK);
		}
	}

	// Scanlines with a slow, subtle flicker.
	float scanline = sin(uv.y * uResolution.y * 3.14159265);
	float flicker = 0.94 + 0.06 * sin(uTime * 18.0 + uSeed * 6.2831);
	col *= 1.0 - uScanlineIntensity * (0.5 + 0.5 * scanline) * flicker;

	// Grain + occasional bright "snow" specks, plus faint horizontal bands
	// of chroma noise -- the slow-drifting color crawl of a worn tape.
	// Hash cells are divided by resK so grain keeps a constant *relative*
	// size instead of shrinking to sub-visible dust on HD.
	float n = hash12(uv * uResolution / resK + vec2(uSeed * 173.1, uTime * 97.3));
	col += (n - 0.5) * uGrainIntensity;
	float snowChance = hash12(uv * uResolution * 0.5 / resK + vec2(uTime * 53.7, uSeed * 211.0));
	col += vec3(step(0.997, snowChance) * uNoiseIntensity * 6.0);
	float chromaBand = hash12(vec2(floor(uv.y * uResolution.y * 0.5 / resK), uTime * 31.0) + uSeed * 7.0);
	col.r += (chromaBand - 0.5) * uNoiseIntensity * 0.15;
	col.b -= (chromaBand - 0.5) * uNoiseIntensity * 0.15;

	// Head-switching noise band at the very bottom of the frame -- the
	// strip of static real VHS decks show where the playback head
	// switches tracks.
	float bottomAmt = smoothstep(1.0 - uBottomNoiseHeight, 1.0, uv.y);
	if (bottomAmt > 0.0) {
		float bandNoise = hash12(vec2(floor(uv.x * uResolution.x * 0.5 / resK), uTime * 240.0));
		col = mix(col, vec3(bandNoise), bottomAmt);
	}

	// Vignette: blended radial + rounded-rect falloff so corners read as a
	// framed screen rather than a plain camera-lens vignette.
	vec2 centered = uv - 0.5;
	float radialFall = dot(centered, centered) * 2.0;
	float rectFall = pow(max(abs(centered.x) * 1.8, abs(centered.y) * 2.0), 2.2);
	float vignette = 1.0 - uVignetteStrength * mix(radialFall, rectFall, 0.35);
	col *= clamp(vignette, 0.0, 1.0);

	// Color grade: saturation, contrast, brightness, warm tape tint.
	float gray = dot(col, vec3(0.299, 0.587, 0.114));
	col = mix(vec3(gray), col, uSaturation);
	col = (col - 0.5) * uContrast + 0.5 + uBrightness;
	col.r += uWarmth * 0.06;
	col.b -= uWarmth * 0.06;

	// Split-tone: a cool tint pulled into the shadows and a warm tint pushed
	// into the highlights -- the classic filmic grade, layered on top of the
	// flat warmth tint above.
	if (uSplitToneStrength > 0.0) {
		float toneLuma = dot(col, vec3(0.299, 0.587, 0.114));
		vec3 shadowTint = vec3(-0.05, 0.01, 0.05);
		vec3 highlightTint = vec3(0.06, 0.02, -0.05);
		col += mix(shadowTint, highlightTint, smoothstep(0.15, 0.85, toneLuma)) * uSplitToneStrength;
	}

	col = clamp(col, 0.0, 1.0);

	// Burned-in REC/timecode overlay, drawn last so grading doesn't touch
	// it -- it's a separate signal layer on the real thing, too. The dark
	// box goes down first for contrast, then the text at full opacity so
	// it stays readable over any footage instead of partially blending in.
	if (uShowTimestamp > 0.5) {
		vec2 ov = overlayCoverage(startUv * uResolution);
		col = mix(col, vec3(0.0), ov.y * 0.42);
		col = mix(col, uOverlayColor, ov.x);
	}

	return col;
}

// ---------------------------------------------------------------------
// Filter family 1: pencil sketch -- white paper, one-sided soft contours,
// a light graphite wash for tonal mass, sparse hatching in deep shadows.
// Tuned by eye against real footage frames (see /tmp/penciltest workflow:
// a numpy replica of this exact function previewed on cartoon + aerial
// footage until it read as pencil, then ported back here).
//
// - Contour is a one-sided DoG ((blurred - sharp) * gain): only the dark
//   side of a boundary draws, so each edge renders ONE soft line instead
//   of Sobel's twin dark worms on both sides. The blur radius (~1% of
//   frame height) swallows pixel-level texture (grass blades, foliage
//   speckle) while real shape boundaries survive -- this is what keeps
//   lawns from turning into topographic maps.
// - Tonal mass is a light wash, pow(1-luma, 2): whites stay paper, darks
//   fall to mid-gray. Never a global multiply of the source tone, which
//   turns the whole frame dingy gray.
// - uEdgeThreshold slides the contour gate (higher = lower gate = more,
//   fainter lines); everything else is fixed, tuned constants.
// - All grain is a static function of pixel position (no uTime/uSeed), so
//   the "paper" doesn't crawl or flicker between video frames -- and the
//   encoder thanks us with smaller files.
// ---------------------------------------------------------------------
float pencilBlur13(vec2 uv, vec2 texel, float r) {
	vec2 rx = vec2(r * texel.x, 0.0);
	vec2 ry = vec2(0.0, r * texel.y);
	float c = lumaOf(sampleColor(uv)) * 0.20;
	float ax = lumaOf(sampleColor(uv + rx)) + lumaOf(sampleColor(uv - rx))
		+ lumaOf(sampleColor(uv + ry)) + lumaOf(sampleColor(uv - ry));
	float dg = lumaOf(sampleColor(uv + rx + ry)) + lumaOf(sampleColor(uv - rx - ry))
		+ lumaOf(sampleColor(uv + rx - ry)) + lumaOf(sampleColor(uv - rx + ry));
	vec2 fx = rx * 2.0;
	vec2 fy = ry * 2.0;
	float fr = lumaOf(sampleColor(uv + fx)) + lumaOf(sampleColor(uv - fx))
		+ lumaOf(sampleColor(uv + fy)) + lumaOf(sampleColor(uv - fy));
	return c + ax * 0.10 + dg * 0.06 + fr * 0.04;
}

vec3 renderPencil(vec2 uv) {
	vec2 texel = vec2(1.0 / uResolution.x, 1.0 / uResolution.y);
	vec2 fragPx = uv * uResolution;
	float gray = lumaOf(sampleColor(uv));
	// Same resolution compensation as the VHS family: stroke radii already
	// scale with frame height; resK additionally keeps paper-tooth, fiber,
	// grain and hatch at a constant relative size so HD output doesn't go
	// "too smooth" next to the 480p look these were tuned at.
	float resK = clamp(uResolution.y / 480.0, 1.0, 3.0);

	// Radii scale with frame height so stroke weight looks the same at any
	// resolution (ratios eyeballed at 360p: 7px dodge blur, 3.5px edge blur).
	float wideR = clamp(uResolution.y * 0.0194, 4.0, 28.0);
	float edgeR = clamp(uResolution.y * 0.0097, 2.0, 14.0);

	// Dodge detail: dips on the dark side of a boundary push a little extra
	// graphite into the foot of each stroke; flats stay at 1.
	float bw = pencilBlur13(uv, texel, wideR);
	float sketch = clamp(gray / max(bw, 0.18), 0.0, 1.0);
	float detail = mix(1.0, smoothstep(0.55, 0.95, sketch), 0.35);

	// One-sided DoG contour -- a single crisp line per edge.
	float be = pencilBlur13(uv, texel, edgeR);
	float gate = mix(0.22, 0.08, uEdgeThreshold);
	float line = smoothstep(gate, gate + 0.22, (be - gray) * 4.5);

	// Paper tooth breaks strokes up like chalk on grain.
	float tooth = hash12(floor(fragPx * 0.6 / resK));
	float toothFine = hash12(floor(fragPx * 0.9 / resK) + 7.0);
	line *= 0.75 + 0.25 * tooth;

	// Light graphite wash: whites stay paper, darks fall to mid-gray.
	float wash = pow(1.0 - gray, 2.0) * 0.45;
	wash *= 0.9 + 0.1 * toothFine;

	// Sparse single-direction hatch, deep shadows only.
	float hatchGate = smoothstep(0.28, 0.45, wash);
	float stroke = step(mod(fragPx.x + fragPx.y, 6.5 * resK), 1.0 * resK) * hatchGate * (0.4 + 0.6 * tooth);

	// Bright paper with static fiber + fine grain, gentle corner falloff.
	float fiber = hash12(floor(uv * uResolution * 0.12 / resK)) * 0.022;
	float grainFine = hash12(floor(uv * uResolution * 0.75 / resK) + 3.0) * 0.028;
	vec3 paper = vec3(0.98, 0.965, 0.935) - fiber - grainFine;
	vec2 centered = uv - 0.5;
	paper *= 1.0 - uVignetteStrength * dot(centered, centered) * 1.2;

	vec3 col = paper * (1.0 - wash) * detail;
	col *= 1.0 - line * 0.85;
	col *= 1.0 - stroke * 0.12;

	return clamp(col, 0.0, 1.0);
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
	float resK = clamp(uResolution.y / 480.0, 1.0, 3.0);

	float spacing = mix(3.0, 7.0, uEdgeThreshold) * resK;
	float w = 1.2 * resK;
	float h0 = step(mod(fragPx.y, spacing), w) * step(0.12, shade);
	float h45 = step(mod(fragPx.x + fragPx.y, spacing), w) * step(0.35, shade);
	float h90 = step(mod(fragPx.x, spacing), w) * step(0.58, shade);
	float h135 = step(mod(fragPx.x - fragPx.y, spacing), w) * step(0.8, shade);

	float mark = clamp(h0 + h45 + h90 + h135, 0.0, 1.0);

	float paperNoise = hash12(uv * uResolution * 0.8 / resK + uSeed * 63.0) * 0.05;
	vec3 paper = vec3(0.97 - paperNoise, 0.95 - paperNoise, 0.9 - paperNoise);
	vec3 inkColor = vec3(0.05, 0.05, 0.08);
	vec3 col = mix(paper, inkColor, mark);

	vec2 centered = uv - 0.5;
	col *= 1.0 - uVignetteStrength * dot(centered, centered);

	float grain = (hash12(uv * uResolution / resK + vec2(uSeed * 29.0, uTime * 19.0)) - 0.5) * uGrainIntensity;
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
	float resK = clamp(uResolution.y / 480.0, 1.0, 3.0);

	float scanline = sin(uv.y * uResolution.y * 3.14159265);
	col *= 1.0 - uScanlineIntensity * (0.5 + 0.5 * scanline);

	float grain = (hash12(uv * uResolution / resK + vec2(uSeed * 173.1, uTime * 97.3)) - 0.5) * uGrainIntensity;
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
	float resK = clamp(uResolution.y / 480.0, 1.0, 3.0);
	vec2 etex = texel * resK;
	float shift = uChromaShift * etex.x;

	float edgeR = sobelEdge(uv + vec2(shift, 0.0), etex);
	float edgeG = sobelEdge(uv, etex);
	float edgeB = sobelEdge(uv - vec2(shift, 0.0), etex);

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
	bloom += sobelEdge(uv + vec2(2.0 * etex.x, 0.0), etex);
	bloom += sobelEdge(uv - vec2(2.0 * etex.x, 0.0), etex);
	bloom += sobelEdge(uv + vec2(0.0, 2.0 * etex.y), etex);
	bloom += sobelEdge(uv - vec2(0.0, 2.0 * etex.y), etex);
	bloom *= 0.25;
	col += vec3(0.1, 0.7, 1.0) * smoothstep(threshold * 0.5, threshold * 1.5, bloom) * uBloomStrength;

	float scanline = sin(uv.y * uResolution.y * 3.14159265);
	col *= 1.0 - uScanlineIntensity * (0.5 + 0.5 * scanline);

	float grain = (hash12(uv * uResolution / resK + vec2(uSeed * 173.1, uTime * 97.3)) - 0.5) * uGrainIntensity;
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

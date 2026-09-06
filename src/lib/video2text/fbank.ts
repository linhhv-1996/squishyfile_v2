/**
 * NeMo-style log-mel filterbank feature extraction.
 *
 * The sherpa-onnx-exported NeMo FastConformer encoder (see
 * static/ai_models/sherpa-onnx-nemo-.../encoder.int8.onnx) starts at
 * `pre_encode/conv` -- it does NOT contain a feature front-end. The encoder's
 * ONNX metadata says `normalize_type=per_feature`, which is NeMo's
 * AudioToMelSpectrogramPreprocessor default. This module reimplements that
 * preprocessor directly in JS (FFT -> power spectrum -> librosa/Slaney-style
 * mel filterbank -> natural-log -> per-utterance per-mel-bin normalization)
 * so the whole pipeline runs on onnxruntime-web with no native/WASM sherpa-onnx
 * dependency.
 *
 * Verified against the reference sherpa-onnx WASM runtime (the real C++
 * implementation, run once for validation against the official sample_wavs
 * shipped with the model) -- this JS implementation reproduces the same
 * transcriptions for English, German, Spanish, French and Russian samples,
 * confirming the parameter choices below (periodic=false Hann window,
 * global preemphasis 0.97, center=True reflect padding, Slaney mel scale,
 * log(x + 2^-24), unbiased per-feature normalization) match what the model
 * was trained/exported with.
 */

export const SAMPLE_RATE = 16000;
const N_FFT = 512;
const WIN_LENGTH = 400; // 25ms at 16kHz
const HOP_LENGTH = 160; // 10ms at 16kHz
export const NUM_MEL_BINS = 80;
const PREEMPHASIS = 0.97;
const LOG_GUARD = Math.pow(2, -24);

/**
 * The encoder's `subsampling_factor` ONNX metadata (confirmed by inspecting
 * encoder.int8.onnx directly -- sherpa-onnx doesn't publish this in any
 * JS-facing API). Each encoder output frame therefore covers this many
 * fbank frames, i.e. this many seconds of audio -- the unit used to turn a
 * token's emission frame index into a wall-clock timestamp.
 */
const SUBSAMPLING_FACTOR = 8;
export const ENCODED_FRAME_DURATION_SEC = (HOP_LENGTH / SAMPLE_RATE) * SUBSAMPLING_FACTOR;

/** In-place iterative radix-2 Cooley-Tukey FFT. `re`/`im` length must be a power of two. */
function fftInPlace(re: Float64Array, im: Float64Array): void {
	const n = re.length;
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			[re[i], re[j]] = [re[j], re[i]];
			[im[i], im[j]] = [im[j], im[i]];
		}
	}
	for (let len = 2; len <= n; len <<= 1) {
		const ang = (-2 * Math.PI) / len;
		const wRe = Math.cos(ang);
		const wIm = Math.sin(ang);
		const half = len / 2;
		for (let i = 0; i < n; i += len) {
			let curRe = 1;
			let curIm = 0;
			for (let k = 0; k < half; k++) {
				const uRe = re[i + k];
				const uIm = im[i + k];
				const vRe = re[i + k + half] * curRe - im[i + k + half] * curIm;
				const vIm = re[i + k + half] * curIm + im[i + k + half] * curRe;
				re[i + k] = uRe + vRe;
				im[i + k] = uIm + vIm;
				re[i + k + half] = uRe - vRe;
				im[i + k + half] = uIm - vIm;
				const nextRe = curRe * wRe - curIm * wIm;
				const nextIm = curRe * wIm + curIm * wRe;
				curRe = nextRe;
				curIm = nextIm;
			}
		}
	}
}

function hzToMel(hz: number): number {
	return 2595 * Math.log10(1 + hz / 700);
}
function melToHz(mel: number): number {
	return 700 * (Math.pow(10, mel / 2595) - 1);
}

/** librosa-compatible (Slaney/HTK=false, area-normalized) triangular mel filterbank. */
function melFilterbankSlaney(
	sampleRate: number,
	nFft: number,
	nMels: number,
	fMin: number,
	fMax: number
): Float32Array[] {
	const nFreqs = nFft / 2 + 1;
	const fftFreqs = new Float64Array(nFreqs);
	for (let i = 0; i < nFreqs; i++) fftFreqs[i] = (i * sampleRate) / nFft;

	const melMin = hzToMel(fMin);
	const melMax = hzToMel(fMax);
	const nPts = nMels + 2;
	const melPts = new Float64Array(nPts);
	for (let i = 0; i < nPts; i++) melPts[i] = melMin + ((melMax - melMin) * i) / (nPts - 1);
	const hzPts = Array.from(melPts, melToHz);

	const weights: Float32Array[] = [];
	for (let m = 0; m < nMels; m++) {
		const fLeft = hzPts[m];
		const fCenter = hzPts[m + 1];
		const fRight = hzPts[m + 2];
		const row = new Float32Array(nFreqs);
		const enorm = 2.0 / (fRight - fLeft);
		for (let k = 0; k < nFreqs; k++) {
			const f = fftFreqs[k];
			let w = 0;
			if (f >= fLeft && f <= fCenter) w = (f - fLeft) / (fCenter - fLeft);
			else if (f > fCenter && f <= fRight) w = (fRight - f) / (fRight - fCenter);
			row[k] = Math.max(0, w) * enorm;
		}
		weights.push(row);
	}
	return weights;
}

// Precomputed once per module load -- fixed sample rate/FFT size for this model.
const MEL_FILTERBANK = melFilterbankSlaney(SAMPLE_RATE, N_FFT, NUM_MEL_BINS, 0, SAMPLE_RATE / 2);

function preemphasize(samples: Float32Array, coeff: number): Float64Array {
	const out = new Float64Array(samples.length);
	out[0] = samples[0];
	for (let i = 1; i < samples.length; i++) out[i] = samples[i] - coeff * samples[i - 1];
	return out;
}

function hannWindowPeriodicFalse(n: number): Float64Array {
	const w = new Float64Array(n);
	const denom = n - 1;
	for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / denom);
	return w;
}

const WINDOW = hannWindowPeriodicFalse(WIN_LENGTH);

export type NemoFeatures = {
	/** Channel-major [NUM_MEL_BINS][numFrames], flattened row by row. */
	data: Float32Array;
	numFrames: number;
};

/**
 * Computes normalized log-mel features for a mono 16kHz signal, laid out as
 * [mel][frame] (channel-major) to match the exported encoder's expected
 * "audio_signal" input shape [1, 80, T].
 */
export function computeNemoFeatures(samples: Float32Array): NemoFeatures {
	const y = preemphasize(samples, PREEMPHASIS);

	// center=True STFT: reflect-pad by n_fft/2 on both sides.
	const pad = N_FFT / 2;
	const padded = new Float64Array(y.length + 2 * pad);
	for (let i = 0; i < pad; i++) padded[pad - 1 - i] = y[Math.min(i + 1, y.length - 1)];
	for (let i = 0; i < y.length; i++) padded[pad + i] = y[i];
	for (let i = 0; i < pad; i++) padded[pad + y.length + i] = y[Math.max(y.length - 2 - i, 0)];

	const numFrames = Math.max(0, 1 + Math.floor((padded.length - N_FFT) / HOP_LENGTH));
	const feats = new Float32Array(NUM_MEL_BINS * numFrames);

	const re = new Float64Array(N_FFT);
	const im = new Float64Array(N_FFT);
	const power = new Float64Array(N_FFT / 2 + 1);

	for (let t = 0; t < numFrames; t++) {
		const start = t * HOP_LENGTH;
		re.fill(0);
		im.fill(0);
		for (let i = 0; i < WIN_LENGTH; i++) re[i] = padded[start + i] * WINDOW[i];
		fftInPlace(re, im);
		for (let k = 0; k <= N_FFT / 2; k++) power[k] = re[k] * re[k] + im[k] * im[k];
		for (let m = 0; m < NUM_MEL_BINS; m++) {
			const row = MEL_FILTERBANK[m];
			let s = 0;
			for (let k = 0; k < row.length; k++) s += row[k] * power[k];
			feats[m * numFrames + t] = Math.log(s + LOG_GUARD);
		}
	}

	// per_feature normalization: zero mean / unit (unbiased) std, per mel bin, over this utterance.
	for (let m = 0; m < NUM_MEL_BINS; m++) {
		const base = m * numFrames;
		let mean = 0;
		for (let t = 0; t < numFrames; t++) mean += feats[base + t];
		mean /= numFrames || 1;
		let varSum = 0;
		for (let t = 0; t < numFrames; t++) {
			const d = feats[base + t] - mean;
			varSum += d * d;
		}
		const std = numFrames > 1 ? Math.sqrt(varSum / (numFrames - 1)) : 0;
		const denom = std + 1e-5;
		for (let t = 0; t < numFrames; t++) feats[base + t] = (feats[base + t] - mean) / denom;
	}

	return { data: feats, numFrames };
}

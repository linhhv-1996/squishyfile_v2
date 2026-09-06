/**
 * Streaming mono-mix + linear-interpolation resampler.
 *
 * Video containers carry audio at whatever rate they were encoded at
 * (44.1kHz/48kHz stereo, typically); the ASR model needs 16kHz mono. This
 * consumes decoded audio one planar-float chunk at a time (as
 * decodedAudioChunk() below builds from Mediabunny's AudioSampleSink) and
 * produces 16kHz mono samples incrementally, so the whole source track's
 * native-rate audio is never held in memory at once -- only the (smaller)
 * resampled output accumulates.
 *
 * Deliberately built on AudioSample.copyTo() rather than
 * AudioSample.toAudioBuffer() / Mediabunny's AudioBufferSink: the DOM
 * `AudioBuffer` constructor is a Window-only API in most browsers and isn't
 * available inside a dedicated Worker's global scope, which is where this
 * whole pipeline runs (see video2text.worker.ts).
 *
 * Linear interpolation is not a "real" resampler (no anti-aliasing filter),
 * but it's simple, fast, and plenty good enough for speech content destined
 * for a robustness-trained ASR model -- a known simplification to revisit
 * if transcription quality on noisy/music-heavy audio ever calls for it.
 */

/** A chunk of decoded audio as planar (non-interleaved) Float32 data, one array per channel. */
export type PlanarAudioChunk = {
	sampleRate: number;
	numberOfChannels: number;
	numberOfFrames: number;
	channelData: Float32Array[];
};

export class StreamingMonoResampler {
	private readonly targetRate: number;
	private sourceRate: number | null = null;
	/** Fractional read position into the (virtual, continuous) source signal, in source samples. */
	private position = 0;
	/** Last sample of the previous chunk, used so interpolation is continuous across chunk boundaries. */
	private prevSample = 0;
	private havePrevSample = false;
	private readonly chunks: Float32Array[] = [];
	private totalLength = 0;

	constructor(targetRate: number) {
		this.targetRate = targetRate;
	}

	/** Mixes a planar audio chunk's channels down to mono and resamples the result into the output stream. */
	push(chunk: PlanarAudioChunk): void {
		if (this.sourceRate === null) this.sourceRate = chunk.sampleRate;
		if (chunk.sampleRate !== this.sourceRate) {
			// Source rate changed mid-track (rare, but not impossible for some
			// containers) -- restart continuity tracking rather than mixing
			// two different rates together incorrectly.
			this.sourceRate = chunk.sampleRate;
			this.position = 0;
			this.havePrevSample = false;
		}

		const numChannels = chunk.numberOfChannels;
		const length = chunk.numberOfFrames;
		const mono = new Float32Array(length);
		for (let i = 0; i < length; i++) {
			let sum = 0;
			for (let c = 0; c < numChannels; c++) sum += chunk.channelData[c][i];
			mono[i] = sum / numChannels;
		}

		this.resampleBuffer(mono);
	}

	private resampleBuffer(mono: Float32Array): void {
		const sourceRate = this.sourceRate!;
		const ratio = sourceRate / this.targetRate;
		const out: number[] = [];

		const sampleAt = (idx: number): number => {
			if (idx < 0) return this.havePrevSample ? this.prevSample : (mono[0] ?? 0);
			return mono[idx];
		};

		// this.position is expressed in "source samples since the start of this buffer" (can be negative,
		// meaning it still refers to the tail of the previous buffer via sampleAt(-1) => prevSample).
		while (this.position < mono.length) {
			const idx0 = Math.floor(this.position);
			const idx1 = idx0 + 1;
			const frac = this.position - idx0;
			const s0 = sampleAt(idx0);
			const s1 = idx1 < mono.length ? mono[idx1] : s0;
			out.push(s0 + (s1 - s0) * frac);
			this.position += ratio;
		}

		if (mono.length > 0) {
			this.prevSample = mono[mono.length - 1];
			this.havePrevSample = true;
		}
		this.position -= mono.length;

		const arr = Float32Array.from(out);
		this.chunks.push(arr);
		this.totalLength += arr.length;
	}

	/** Concatenates everything produced so far into one Float32Array. */
	finish(): Float32Array {
		const result = new Float32Array(this.totalLength);
		let offset = 0;
		for (const chunk of this.chunks) {
			result.set(chunk, offset);
			offset += chunk.length;
		}
		return result;
	}
}

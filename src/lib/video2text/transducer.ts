/**
 * Greedy decoding for the sherpa-onnx-exported NeMo FastConformer offline
 * transducer (encoder + a single-LSTM-layer prediction network + joiner).
 *
 * Signatures below (confirmed by inspecting the actual .onnx graphs, since
 * sherpa-onnx doesn't publish a JS/TS API for this -- there is no wrapper
 * library involved, this talks to the three ONNX graphs directly):
 *
 *   encoder:  audio_signal [1, 80, T] f32, length [1] i64
 *          -> outputs [1, 512, T'] f32, encoded_lengths [1] i64
 *   decoder:  targets [1, 1] i32, target_length [1] i32,
 *             states.1 (h) [1, 1, 640] f32, onnx::LSTM_3 (c) [1, 1, 640] f32
 *          -> outputs [1, 640, 1] f32, prednet_lengths [1] i32,
 *             states (h') [1, 1, 640] f32, "74" (c') [1, 1, 640] f32
 *   joiner:   encoder_outputs [1, 512, 1] f32, decoder_outputs [1, 640, 1] f32
 *          -> outputs [1, 1, 1, vocabSize+1] f32 (raw logits, blank is the last id)
 *
 * Standard RNN-T greedy search: for each encoder frame, keep joining against
 * the current decoder state and emitting non-blank tokens (advancing the
 * predictor each time) until blank wins or a per-frame symbol cap is hit,
 * then move to the next frame.
 *
 * Each emitted token is tagged with the encoder frame index it was emitted
 * at, so callers can turn that into a wall-clock timestamp (see
 * ENCODED_FRAME_DURATION_SEC in fbank.ts) for word-level timestamps.
 */
import * as ort from 'onnxruntime-web';

const ENCODER_DIM = 512;
const DECODER_HIDDEN = 640;
const MAX_SYMBOLS_PER_FRAME = 10;

export type TransducerSessions = {
	encoder: ort.InferenceSession;
	decoder: ort.InferenceSession;
	joiner: ort.InferenceSession;
};

export type TimedTokenId = {
	id: number;
	/** Index of the encoder output frame this token was emitted at. */
	frameIndex: number;
};

async function runDecoderStep(
	sessions: TransducerSessions,
	prevToken: number,
	h: Float32Array<ArrayBufferLike>,
	c: Float32Array<ArrayBufferLike>
): Promise<{
	decOut: Float32Array<ArrayBufferLike>;
	h: Float32Array<ArrayBufferLike>;
	c: Float32Array<ArrayBufferLike>;
}> {
	const feeds = {
		targets: new ort.Tensor('int32', Int32Array.from([prevToken]), [1, 1]),
		target_length: new ort.Tensor('int32', Int32Array.from([1]), [1]),
		'states.1': new ort.Tensor('float32', h, [1, 1, DECODER_HIDDEN]),
		'onnx::LSTM_3': new ort.Tensor('float32', c, [1, 1, DECODER_HIDDEN])
	};
	const out = await sessions.decoder.run(feeds);
	return {
		decOut: out.outputs.data as Float32Array<ArrayBufferLike>,
		h: out.states.data as Float32Array<ArrayBufferLike>,
		c: out['74'].data as Float32Array<ArrayBufferLike>
	};
}

async function runJoinerStep(
	sessions: TransducerSessions,
	encFrame: Float32Array,
	decOut: Float32Array<ArrayBufferLike>
): Promise<Float32Array<ArrayBufferLike>> {
	const feeds = {
		encoder_outputs: new ort.Tensor('float32', encFrame, [1, ENCODER_DIM, 1]),
		decoder_outputs: new ort.Tensor('float32', decOut, [1, DECODER_HIDDEN, 1])
	};
	const out = await sessions.joiner.run(feeds);
	return out.outputs.data as Float32Array<ArrayBufferLike>;
}

function argmax(logits: Float32Array<ArrayBufferLike>): number {
	let best = 0;
	let bestVal = -Infinity;
	for (let i = 0; i < logits.length; i++) {
		if (logits[i] > bestVal) {
			bestVal = logits[i];
			best = i;
		}
	}
	return best;
}

/**
 * Transcribes one chunk's worth of already-computed log-mel features
 * (channel-major [80][numFrames], as produced by computeNemoFeatures) into
 * a list of (token id, encoder frame index) pairs. Callers turn the ids
 * into text via `piecesToText`/`tokensToWords`, and the frame indices into
 * timestamps via ENCODED_FRAME_DURATION_SEC.
 */
export async function greedyDecodeChunk(
	sessions: TransducerSessions,
	features: Float32Array,
	numFrames: number,
	blankId: number,
	onEncoderFrameProgress?: (fraction: number) => void
): Promise<TimedTokenId[]> {
	if (numFrames === 0) return [];

	const audioSignal = new ort.Tensor('float32', features, [1, 80, numFrames]);
	const lengthTensor = new ort.Tensor('int64', BigInt64Array.from([BigInt(numFrames)]), [1]);
	const encoderOut = await sessions.encoder.run({ audio_signal: audioSignal, length: lengthTensor });

	const encoded = encoderOut.outputs;
	const encFrames = encoded.dims[2] as number;
	const encData = encoded.data as Float32Array;

	let h: Float32Array<ArrayBufferLike> = new Float32Array(DECODER_HIDDEN);
	let c: Float32Array<ArrayBufferLike> = new Float32Array(DECODER_HIDDEN);
	let decStep = await runDecoderStep(sessions, blankId, h, c);
	let decOut = decStep.decOut;
	h = decStep.h;
	c = decStep.c;

	const resultTokens: TimedTokenId[] = [];
	const encFrame = new Float32Array(ENCODER_DIM);

	for (let t = 0; t < encFrames; t++) {
		for (let d = 0; d < ENCODER_DIM; d++) encFrame[d] = encData[d * encFrames + t];

		for (let symbolsThisFrame = 0; symbolsThisFrame < MAX_SYMBOLS_PER_FRAME; symbolsThisFrame++) {
			const logits = await runJoinerStep(sessions, encFrame, decOut);
			const best = argmax(logits);
			if (best === blankId) break;
			resultTokens.push({ id: best, frameIndex: t });
			decStep = await runDecoderStep(sessions, best, h, c);
			decOut = decStep.decOut;
			h = decStep.h;
			c = decStep.c;
		}

		onEncoderFrameProgress?.((t + 1) / encFrames);
	}

	return resultTokens;
}

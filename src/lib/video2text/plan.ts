/**
 * Pure planning for video -> text -- no browser/ONNX/audio APIs, just the
 * constants and chunking math the tool is built around. Mirrors the shape
 * of $lib/upscale/plan.ts / $lib/compress/plan.ts.
 *
 * Model: the multilingual NeMo FastConformer transducer -- one fixed model
 * for now (per-language model swapping is a later concern), covering these
 * languages out of the box.
 *
 * At ~138MB uncompressed this is far too large to ship as a static asset in
 * the Cloudflare Pages deploy, so it isn't bundled under static/ at all --
 * see video2text.worker.ts's loadModel(), which fetches MODEL_ZIP_URL once
 * (a single zip hosted on Hugging Face), unzips it client-side, and caches
 * the four member files below individually (keyed by the MODEL_FILES paths
 * as plain cache keys, not real fetchable URLs) so every load after the
 * first skips the network + unzip entirely.
 */

export const MODEL_DIR =
	'/ai_models/sherpa-onnx-nemo-fast-conformer-transducer-be-de-en-es-fr-hr-it-pl-ru-uk-20k-int8';

export const MODEL_FILES = {
	encoder: `${MODEL_DIR}/encoder.int8.onnx`,
	decoder: `${MODEL_DIR}/decoder.int8.onnx`,
	joiner: `${MODEL_DIR}/joiner.int8.onnx`,
	tokens: `${MODEL_DIR}/tokens.txt`
} as const;

/**
 * Single zip archive containing the whole model directory (encoder/decoder/
 * joiner/tokens.txt, plus test_wavs this tool doesn't need). Downloaded once
 * per browser and cached -- see loadModel() in video2text.worker.ts.
 */
export const MODEL_ZIP_URL =
	'https://huggingface.co/buckets/hvlinhtptn/sherpa-onnx/resolve/sherpa-onnx-nemo-fast-conformer-transducer-be-de-en-es-fr-hr-it-pl-ru-uk-20k-int8.zip?download=true';

/**
 * The zip's internal paths aren't load-bearing here -- whatever top-level
 * folder name the archive uses, each member file is picked out by matching
 * the end of its path against these suffixes, so a rename/re-export on the
 * Hugging Face side doesn't silently break loading.
 */
export const MODEL_ZIP_ENTRY_SUFFIXES: Record<keyof typeof MODEL_FILES, string> = {
	encoder: 'encoder.int8.onnx',
	decoder: 'decoder.int8.onnx',
	joiner: 'joiner.int8.onnx',
	tokens: 'tokens.txt'
};

export const SUPPORTED_LANGUAGES = [
	{ code: 'be', name: 'Belarusian' },
	{ code: 'de', name: 'German' },
	{ code: 'en', name: 'English' },
	{ code: 'es', name: 'Spanish' },
	{ code: 'fr', name: 'French' },
	{ code: 'hr', name: 'Croatian' },
	{ code: 'it', name: 'Italian' },
	{ code: 'pl', name: 'Polish' },
	{ code: 'ru', name: 'Russian' },
	{ code: 'uk', name: 'Ukrainian' }
] as const;

/**
 * The transducer encoder runs as one offline (non-streaming) forward pass
 * over its whole input -- self-attention cost grows with the square of the
 * chunk length, and holding a very long utterance's features in memory adds
 * up fast. Splitting long audio into fixed windows keeps both bounded and
 * lets progress be reported per chunk. No overlap between chunks in this
 * first version -- a word that straddles a chunk boundary can come out
 * slightly mangled, a known limitation rather than a bug.
 */
export const CHUNK_DURATION_SEC = 20;

export type AudioChunkPlan = {
	/** Chunk start offsets, in samples at the target 16kHz rate. */
	startSamples: number[];
	chunkLengthSamples: number;
};

export function planAudioChunks(totalSamples: number, sampleRate: number): AudioChunkPlan {
	const chunkLengthSamples = Math.max(1, Math.round(CHUNK_DURATION_SEC * sampleRate));
	const startSamples: number[] = [];
	for (let start = 0; start < totalSamples; start += chunkLengthSamples) {
		startSamples.push(start);
	}
	if (startSamples.length === 0) startSamples.push(0);
	return { startSamples, chunkLengthSamples };
}

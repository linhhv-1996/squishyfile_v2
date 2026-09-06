/**
 * Loads the sherpa-onnx `tokens.txt` vocabulary (SentencePiece BPE pieces,
 * one "<piece> <id>" pair per line) and turns decoded token ids back into
 * text -- plain, or grouped into words/sentences with timestamps.
 *
 * The blank/background symbol is always the last id in the file (`<blk>`)
 * -- that's the sherpa-onnx transducer export convention, not something
 * declared elsewhere in the model.
 */

export type Tokenizer = {
	pieces: string[];
	blankId: number;
};

export function parseTokens(tokensTxt: string): Tokenizer {
	const pieces: string[] = [];
	for (const line of tokensTxt.split('\n')) {
		if (line.length === 0) continue;
		const idx = line.lastIndexOf(' ');
		if (idx < 0) continue;
		pieces.push(line.slice(0, idx));
	}
	return { pieces, blankId: pieces.length - 1 };
}

const WORD_BOUNDARY = '▁';

/** SentencePiece convention: '▁' marks a word-start and renders as a space. */
export function piecesToText(pieces: string[]): string {
	return pieces
		.join('')
		.replace(new RegExp(WORD_BOUNDARY, 'g'), ' ')
		.trim()
		.replace(/ +/g, ' ');
}

export type TimedToken = { piece: string; timeSec: number };
export type TimedWord = { text: string; startSec: number };

/**
 * Groups a flat token stream into words: a piece starting with '▁' begins a
 * new word (using the timestamp of that first piece); any piece without the
 * marker is a continuation of the sub-word split and gets appended to the
 * word currently being built. This is the same rule `piecesToText` encodes
 * implicitly via string replacement -- this version keeps the per-word
 * start time alongside the text instead of collapsing straight to a string.
 */
export function tokensToWords(tokens: TimedToken[]): TimedWord[] {
	const words: TimedWord[] = [];
	for (const { piece, timeSec } of tokens) {
		if (piece.length === 0) continue;
		const isBoundary = piece.startsWith(WORD_BOUNDARY);
		const content = piece.replace(new RegExp(WORD_BOUNDARY, 'g'), '');

		if (isBoundary || words.length === 0) {
			words.push({ text: content, startSec: timeSec });
		} else {
			words[words.length - 1].text += content;
		}
	}
	// A lone "▁" (word-boundary marker with nothing attached, e.g. if the
	// model never emits a continuation piece after it) leaves an empty word
	// -- drop those rather than showing a stray timestamp with no text.
	return words.filter((w) => w.text.length > 0);
}

const SENTENCE_END_RE = /[.!?…]$/;

/**
 * Groups timed words into subtitle-like lines, breaking after a word that
 * ends in sentence-final punctuation. The multilingual model was exported
 * "with Punctuation and Capitalization" (see the encoder's ONNX metadata
 * `comment`/`doc` fields), so this punctuation is actually present in the
 * model's own output, not something added here.
 */
export type TimedSegment = { text: string; startSec: number; endSec: number };

/**
 * endSec is approximated as the start time of the sentence's last word (we
 * don't have per-word durations, only per-word start times) -- close enough
 * to detect a pause before the next sentence, which is all paragraphs.ts
 * uses it for.
 */
export function wordsToSegments(words: TimedWord[]): TimedSegment[] {
	const segments: TimedSegment[] = [];
	let current: string[] = [];
	let currentStart = 0;
	let currentEnd = 0;

	for (const word of words) {
		if (current.length === 0) currentStart = word.startSec;
		current.push(word.text);
		currentEnd = word.startSec;
		if (SENTENCE_END_RE.test(word.text)) {
			segments.push({ text: current.join(' '), startSec: currentStart, endSec: currentEnd });
			current = [];
		}
	}
	if (current.length > 0) segments.push({ text: current.join(' '), startSec: currentStart, endSec: currentEnd });

	return segments;
}

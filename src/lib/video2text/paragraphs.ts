/**
 * Groups timestamped sentences (see tokenizer.ts's wordsToSegments) into
 * reading paragraphs for the plain-text transcript view (the one shown
 * when "show timestamps" is off).
 *
 * This has to work across all ten languages the model transcribes, so it
 * can't lean on a language-specific sentence/paragraph splitter (e.g.
 * nltk's Punkt models, which are tuned per-language, need their data
 * files bundled, and still wouldn't cover something like Vietnamese or
 * Chinese well). Instead it reuses two signals that are already
 * language-neutral:
 *
 *   - sentence boundaries the model itself emits as punctuation
 *     (wordsToSegments already turned those into discrete sentences), and
 *   - pauses in the audio: a gap between one sentence's last word and the
 *     next sentence's first word longer than PAUSE_BREAK_SEC usually means
 *     the speaker paused or took a breath -- a natural paragraph break,
 *     and it works the same whether the speech is English, Vietnamese, or
 *     Mandarin.
 *
 * On top of the pause signal, a paragraph is also cut once it reaches a
 * sentence-count or character-count ceiling, so a speaker who never
 * pauses (or a language where the model rarely emits punctuation) doesn't
 * still produce one giant unbroken block.
 */

export type TimedSegment = { text: string; startSec: number; endSec: number };

const PAUSE_BREAK_SEC = 1.2;
const MAX_SENTENCES_PER_PARAGRAPH = 5;
const MAX_CHARS_PER_PARAGRAPH = 480;

export function segmentsToParagraphs(segments: TimedSegment[]): string[] {
	const paragraphs: string[] = [];
	let current: string[] = [];
	let currentChars = 0;
	let prevEndSec: number | null = null;

	for (const seg of segments) {
		const pause = prevEndSec === null ? 0 : seg.startSec - prevEndSec;
		const wouldOverflow =
			current.length > 0 &&
			(current.length >= MAX_SENTENCES_PER_PARAGRAPH ||
				currentChars + seg.text.length > MAX_CHARS_PER_PARAGRAPH);

		if (current.length > 0 && (pause >= PAUSE_BREAK_SEC || wouldOverflow)) {
			paragraphs.push(current.join(' '));
			current = [];
			currentChars = 0;
		}

		current.push(seg.text);
		currentChars += seg.text.length;
		prevEndSec = seg.endSec;
	}
	if (current.length > 0) paragraphs.push(current.join(' '));

	return paragraphs;
}

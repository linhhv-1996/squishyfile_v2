/**
 * Pure planning for video -> MP3 conversion -- no browser/encoder APIs.
 *
 * Much simpler than video compression: there's no resolution/bpp tradeoff to
 * make, just an audio bitrate choice. Both engines (Mediabunny and
 * ffmpeg.wasm) consume the same plan, so they behave identically.
 */

/** The three MP3 bitrates offered in the UI, in kbps. */
export type Mp3Quality = 128 | 192 | 320;

export const MP3_QUALITIES: Mp3Quality[] = [128, 192, 320];

/** Everything the planner needs to know about the input file's audio. */
export type SourceAudioInfo = {
	/** Duration in seconds. */
	durationSec: number;
	/** Whether the source actually has an audio track. */
	hasAudio: boolean;
	/** Source channel count (meaningless when hasAudio is false). */
	audioChannels: number;
	/** Source sample rate in Hz, or null if unknown. */
	audioSampleRate: number | null;
};

export type ConversionPlan = {
	/** Audio bitrate in bits/sec. */
	audioBitrate: number;
	audioChannels: number;
	/** Output sample rate in Hz. */
	sampleRate: number;
};

/**
 * MP3 (MPEG-1 Layer III) only supports 32000/44100/48000 Hz. 44100 is the
 * near-universal default for MP3 players and DAWs, so we normalize to it
 * rather than trying to preserve the source's own rate.
 */
const OUTPUT_SAMPLE_RATE = 44100;

export function planForQuality(source: SourceAudioInfo, quality: Mp3Quality): ConversionPlan {
	return {
		audioBitrate: quality * 1000,
		// MP3 only carries mono or stereo. Downmix anything wider (5.1, etc.)
		// to stereo, but keep a genuinely mono source mono instead of
		// needlessly upmixing it to two identical channels.
		audioChannels: source.audioChannels === 1 ? 1 : 2,
		sampleRate: OUTPUT_SAMPLE_RATE
	};
}

/**
 * Mediabunny engine -- the fast path for video -> MP3.
 *
 * Uses Mediabunny to demux the source and, when this browser exposes a
 * native MP3 encoder through WebCodecs, encode straight to MP3 without ever
 * touching ffmpeg.wasm. Most browsers currently ship no native MP3 encoder
 * (WebCodecs support tends to cover AAC/Opus, not MP3), so
 * canEncodeMp3Natively() below decides per-visitor whether this path is even
 * usable -- the worker falls back to ffmpeg.ts when it isn't. Same shape as
 * the video-compression tool's mediabunny.ts: probe() + a convert function,
 * both consuming the plan from ./plan.ts.
 */
import {
	ALL_FORMATS,
	BlobSource,
	BufferTarget,
	Conversion,
	Input,
	Mp3OutputFormat,
	Output,
	Quality,
	canEncodeAudio
} from 'mediabunny';
import type { ConversionPlan, SourceAudioInfo } from './plan';

/** Thrown when this engine can't handle the file and the caller should fall back. */
export class UnsupportedByMediabunnyError extends Error {}

/** Thrown when the file is readable but simply has no audio track to extract. */
export class NoAudioTrackError extends Error {}

export async function probe(file: File): Promise<SourceAudioInfo> {
	const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });

	let audioTrack;
	try {
		audioTrack = await input.getPrimaryAudioTrack();
	} catch {
		throw new UnsupportedByMediabunnyError('Mediabunny cannot read this container');
	}
	if (!audioTrack) throw new NoAudioTrackError('This file has no audio track');

	const durationSec = await input.computeDuration();

	return {
		durationSec,
		hasAudio: true,
		audioChannels: audioTrack.numberOfChannels,
		audioSampleRate: audioTrack.sampleRate
	};
}

/**
 * Whether this browser can encode MP3 through WebCodecs at all, at the given
 * bitrate. This is the one question that decides Mediabunny vs ffmpeg for a
 * container Mediabunny can read -- there's no equivalent of the compression
 * tool's "can this browser encode H.264" check needed beyond this, since MP3
 * is the only output format this tool ever produces.
 */
export async function canEncodeMp3Natively(bitrate: number): Promise<boolean> {
	return canEncodeAudio('mp3', { bitrate });
}

export async function convertWithMediabunny(
	file: File,
	plan: ConversionPlan,
	onProgress: (fraction: number) => void,
	signal?: AbortSignal
): Promise<Blob> {
	const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
	const output = new Output({ format: new Mp3OutputFormat(), target: new BufferTarget() });

	const conversion = await Conversion.init({
		input,
		output,
		tracks: 'primary',
		showWarnings: false,
		// This tool only ever outputs audio -- the video track is always
		// discarded, never transcoded.
		video: { discard: true },
		audio: {
			codec: 'mp3',
			numberOfChannels: plan.audioChannels,
			sampleRate: plan.sampleRate,
			quality: new Quality({ bitrate: plan.audioBitrate }),
			// Without this, Mediabunny may pass the original audio stream
			// straight through when it thinks nothing changed -- we need an
			// actual MP3-encoded track, not whatever codec the source used.
			forceTranscode: true
		}
	});

	if (!conversion.isValid) {
		const reasons = conversion.discardedTracks.map((t) => t.reason).join(', ');
		throw new UnsupportedByMediabunnyError(`Audio track could not be converted: ${reasons}`);
	}

	conversion.onProgress = (progress) => onProgress(progress);

	const onAbort = () => void conversion.cancel();
	signal?.addEventListener('abort', onAbort, { once: true });
	try {
		await conversion.execute();
	} finally {
		signal?.removeEventListener('abort', onAbort);
	}

	const buffer = (output.target as BufferTarget).buffer;
	if (!buffer) throw new Error('Conversion produced no output');
	return new Blob([buffer], { type: 'audio/mpeg' });
}

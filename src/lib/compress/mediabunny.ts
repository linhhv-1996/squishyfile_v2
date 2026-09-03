/**
 * Mediabunny engine — the fast path.
 *
 * Uses the browser's own WebCodecs encoders (hardware-accelerated where
 * available), so a phone clip compresses in seconds rather than minutes. Used
 * for every container Mediabunny can demux: MP4, MOV, MKV, WebM, TS, and more.
 */
import {
	ALL_FORMATS,
	BlobSource,
	BufferTarget,
	Conversion,
	Input,
	Mp4OutputFormat,
	Output,
	Quality,
	canEncodeVideo,
	getFirstEncodableAudioCodec
} from 'mediabunny';
import type { AudioCodec } from 'mediabunny';
import type { CompressionPlan, SourceInfo } from './plan';

/** Thrown when this engine can't handle the file and the caller should fall back. */
export class UnsupportedByMediabunnyError extends Error {}

export type ProbeResult = { source: SourceInfo; input: Input };

/**
 * Read the source metadata the planner needs.
 *
 * `computePacketStats` is sampled rather than exhaustive — scanning every
 * packet of a 4K hour-long file just to learn its bitrate would cost more time
 * than the encode itself.
 */
export async function probe(file: File): Promise<SourceInfo> {
	const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });

	let videoTrack;
	try {
		videoTrack = await input.getPrimaryVideoTrack();
	} catch {
		throw new UnsupportedByMediabunnyError('Mediabunny cannot read this container');
	}
	if (!videoTrack) throw new UnsupportedByMediabunnyError('No video track found');

	const audioTrack = await input.getPrimaryAudioTrack();

	const [durationSec, width, height] = await Promise.all([
		input.computeDuration(),
		videoTrack.getDisplayWidth(),
		videoTrack.getDisplayHeight()
	]);

	let frameRate = 30;
	let videoBitrate: number | null = null;
	try {
		const stats = await videoTrack.computePacketStats(120);
		if (stats.averagePacketRate > 0) frameRate = stats.averagePacketRate;
		if (stats.averageBitrate > 0) videoBitrate = stats.averageBitrate;
	} catch {
		// Stats are an optimisation, not a requirement — the planner copes
		// with nulls by falling back to its bpp model alone.
	}

	return {
		durationSec,
		width,
		height,
		frameRate,
		videoBitrate,
		totalBytes: file.size,
		hasAudio: audioTrack !== null,
		audioChannels: audioTrack?.numberOfChannels ?? 0
	};
}

/**
 * Can this browser encode H.264 at all?
 *
 * This is the *only* question that decides Mediabunny vs ffmpeg for a
 * container Mediabunny can read. Deliberately not checking AAC here: Firefox
 * ships an AVC encoder but no AAC encoder, and dragging every MP4 through a
 * 32 MB wasm build because of the audio track would be absurd when MP4 can
 * carry Opus perfectly well.
 */
export async function canEncodeVideoNatively(): Promise<boolean> {
	return canEncodeVideo('avc');
}

/**
 * AAC first for maximum compatibility, Opus as the fallback where AAC
 * encoding isn't available. Null means this browser can't encode audio at
 * all, and the track gets dropped rather than failing the whole conversion.
 */
async function pickAudioCodec(): Promise<AudioCodec | null> {
	return getFirstEncodableAudioCodec(['aac', 'opus']);
}

function buildQuality(plan: CompressionPlan): Quality {
	if (plan.mode === 'target' || plan.quantizer === null) {
		// Constant bitrate: we care about landing on a size, not about holding
		// a constant quality. Variable-rate encoding is the enemy here — it
		// spends freely on hard scenes and blows the budget.
		return new Quality({ bitrate: plan.videoBitrate, bitrateMode: 'constant' });
	}
	// Level mode: constant quality, with our computed bitrate as the fallback
	// for encoders that don't expose a quantizer.
	return new Quality({ quantizer: plan.quantizer, bitrate: plan.videoBitrate });
}

export async function compressWithMediabunny(
	file: File,
	plan: CompressionPlan,
	onProgress: (fraction: number) => void,
	signal?: AbortSignal
): Promise<Blob> {
	const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
	const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });

	const audioCodec = plan.audioBitrate === null ? null : await pickAudioCodec();

	const conversion = await Conversion.init({
		input,
		output,
		tracks: 'primary',
		showWarnings: false,
		video: {
			width: plan.width,
			height: plan.height,
			fit: 'contain',
			frameRate: plan.frameRate,
			codec: 'avc',
			quality: buildQuality(plan),
			keyFrameInterval: plan.keyFrameInterval,
			// Without this, Mediabunny may pass the original stream straight
			// through when it thinks nothing changed — and we'd hand back a
			// file that isn't compressed at all.
			forceTranscode: true
		},
		audio:
			audioCodec === null
				? { discard: true }
				: {
						codec: audioCodec,
						numberOfChannels: plan.audioChannels,
						quality: new Quality({ bitrate: plan.audioBitrate! }),
						forceTranscode: true
					}
	});

	if (!conversion.isValid) {
		const reasons = conversion.discardedTracks.map((t) => t.reason).join(', ');
		throw new UnsupportedByMediabunnyError(`Tracks could not be converted: ${reasons}`);
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
	return new Blob([buffer], { type: 'video/mp4' });
}

/**
 * ffmpeg.wasm engine -- the compatibility path for video -> MP3.
 *
 * Handles containers Mediabunny can't demux (AVI, WMV, FLV, ...) and browsers
 * with no native MP3 encoder. Deliberately self-contained -- its own core
 * loader, its own container list -- rather than importing state from the
 * video-compression tool's ffmpeg.ts: the two tools live on separate pages
 * (this site is an MPA, every route change is a full navigation that resets
 * all module state anyway), and giving each feature folder its own engine
 * matches this codebase's existing convention (see architecture.md: "when
 * adding a new feature area, give it its own subfolder... don't go back to a
 * flat dump").
 *
 * Same single-threaded core build as the compression tool, for the same
 * reason: multi-threaded needs SharedArrayBuffer, which needs COOP/COEP
 * headers, which would break static hosting and third-party embeds.
 */
import type { ConversionPlan, SourceAudioInfo } from './plan';

const CORE_VERSION = '0.12.10';
// See the matching comment in the compression tool's ffmpeg.ts: the ESM
// build is required because @ffmpeg/ffmpeg's internal worker is always a
// module worker, and only the ESM core has the `export default` it needs.
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

/** Versioned so a core upgrade doesn't serve a stale wasm binary forever. */
const CACHE_NAME = `squishyfile-ffmpeg-core-${CORE_VERSION}`;

/**
 * Fallback size (bytes) used to compute wasm download progress when the
 * CDN response has no usable Content-Length header. Approximate -- only
 * needs to be in the right ballpark so the bar advances at a believable
 * rate; the real fraction takes over whenever Content-Length is present.
 */
const FFMPEG_WASM_ESTIMATED_BYTES = 32 * 1024 * 1024;

/**
 * Containers Mediabunny cannot demux -- the same boundary the compression
 * tool uses, duplicated here intentionally (see file header).
 */
const FFMPEG_ONLY_EXTENSIONS = new Set([
	'avi',
	'wmv',
	'asf',
	'flv',
	'f4v',
	'rm',
	'rmvb',
	'mpg',
	'mpeg',
	'mpe',
	'm1v',
	'm2v',
	'vob',
	'divx',
	'ogv',
	'mts',
	'm2ts',
	'dv',
	'3g2',
	'swf'
]);

export function needsFfmpeg(fileName: string): boolean {
	const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
	return FFMPEG_ONLY_EXTENSIONS.has(ext);
}

type FFmpegInstance = import('@ffmpeg/ffmpeg').FFmpeg;

let instance: FFmpegInstance | null = null;
let loading: Promise<FFmpegInstance> | null = null;

/**
 * Fetch a core asset, serving it from the Cache API when we've seen it
 * before. The Cache API is keyed by URL and shared across the whole origin,
 * so this cache entry is reused even if the compression tool's own ffmpeg.ts
 * already downloaded the same CORE_VERSION on an earlier page -- only the
 * in-memory `instance`/`loading` singleton above is per-module, not the
 * downloaded bytes.
 */
async function loadCoreAsset(
	url: string,
	mimeType: string,
	onProgress: (received: number, total: number) => void
): Promise<{ url: string; fromCache: boolean }> {
	const cache = await caches.open(CACHE_NAME).catch(() => null);
	const hit = await cache?.match(url).catch(() => undefined);

	const response = hit ?? (await fetch(url));
	if (!response.ok) throw new Error(`Could not download ${url} (${response.status})`);

	const total = Number(response.headers.get('content-length')) || 0;
	const reader = response.body?.getReader();

	let blob: Blob;
	if (!reader) {
		blob = new Blob([await response.arrayBuffer()], { type: mimeType });
	} else {
		const chunks: Uint8Array[] = [];
		let received = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
			received += value.length;
			onProgress(received, total);
		}
		blob = new Blob(chunks as BlobPart[], { type: mimeType });
	}

	// Cache from the blob we just finished assembling -- NOT via
	// response.clone() taken before the read loop above. clone() tees the
	// network stream, and cache.put() awaits until it has fully drained its
	// side of the tee to store it; when that await sits *before* the
	// progress-tracked loop (as this used to), the loop's reader hasn't
	// pulled a single byte yet, so the whole download piles up in the tee's
	// internal buffer while cache.put races ahead unseen. By the time
	// cache.put resolves, the file is already fully downloaded, and the loop
	// then drains that buffer in one near-instant burst -- onProgress fires
	// with the download already finished, which reads as "stuck at 0%, then
	// jumps to 100%" no matter what `total` is. Building the cache entry
	// from the in-memory blob afterwards means there's only ever one reader
	// of the real network stream: this loop, so progress reflects bytes as
	// they actually arrive.
	if (!hit && cache) {
		await cache.put(url, new Response(blob, { headers: { 'Content-Type': mimeType } })).catch(() => {});
	}

	return { url: URL.createObjectURL(blob), fromCache: hit !== undefined };
}

async function getFfmpeg(
	onLoadProgress?: (fraction: number, fromCache: boolean) => void
): Promise<FFmpegInstance> {
	if (instance) return instance;
	if (loading) return loading;

	loading = (async () => {
		const { FFmpeg } = await import('@ffmpeg/ffmpeg');
		const ffmpeg = new FFmpeg();

		// Fire immediately, before any byte has moved -- the CDN response
		// doesn't always send a content-length, so this may be the only signal
		// the caller gets that we've moved past "probing" into "downloading".
		onLoadProgress?.(0, false);

		const core = await loadCoreAsset(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript', () => {});
		let cached = core.fromCache;

		const wasm = await loadCoreAsset(
			`${CORE_BASE}/ffmpeg-core.wasm`,
			'application/wasm',
			(received, total) => {
				// unpkg doesn't reliably send Content-Length for this response (it
				// varies by edge/cache state), which used to leave `total` at 0 and
				// this callback a no-op for the entire download -- the bar sat at
				// 0% for the whole ~32 MB fetch, then jumped straight to 100% once
				// loading finished. Fall back to a hardcoded size estimate so the
				// bar still advances; cap below 100% so an estimate that's off
				// can't claim "done" before the real completion signal below does.
				const effectiveTotal = total > 0 ? total : FFMPEG_WASM_ESTIMATED_BYTES;
				onLoadProgress?.(Math.min(0.99, received / effectiveTotal), cached);
			}
		);
		cached = cached && wasm.fromCache;
		onLoadProgress?.(1, cached);

		await ffmpeg.load({ coreURL: core.url, wasmURL: wasm.url });
		instance = ffmpeg;
		return ffmpeg;
	})();

	try {
		return await loading;
	} finally {
		loading = null;
	}
}

function buildArgs(plan: ConversionPlan, inName: string, outName: string): string[] {
	return [
		'-i',
		inName,
		// Drop video entirely -- this tool only ever outputs audio, and
		// decoding/discarding video frames we don't need would just waste time.
		'-vn',
		'-c:a',
		'libmp3lame',
		'-b:a',
		String(plan.audioBitrate),
		'-ar',
		String(plan.sampleRate),
		'-ac',
		String(plan.audioChannels),
		outName
	];
}

export async function convertWithFfmpeg(
	file: File,
	plan: ConversionPlan,
	onProgress: (fraction: number) => void,
	onStage: (stage: 'loading' | 'encoding', fraction: number) => void,
	signal?: AbortSignal
): Promise<Blob> {
	onStage('loading', 0);
	const ffmpeg = await getFfmpeg((fraction) => onStage('loading', fraction));
	onStage('encoding', 0);

	const inName = `input.${file.name.split('.').pop()?.toLowerCase() || 'bin'}`;
	const outName = 'output.mp3';

	const handleProgress = ({ progress }: { progress: number }) => {
		if (Number.isFinite(progress)) onProgress(Math.min(1, Math.max(0, progress)));
	};
	ffmpeg.on('progress', handleProgress);

	// See the matching comment in the compression tool's ffmpeg.ts: terminate()
	// permanently kills the internal worker, so the module-level singleton
	// must be cleared too, or the next conversion reuses a dead instance and
	// fails immediately with "ffmpeg is not loaded".
	const onAbort = () => {
		ffmpeg.terminate();
		if (instance === ffmpeg) instance = null;
	};
	signal?.addEventListener('abort', onAbort, { once: true });

	try {
		await ffmpeg.writeFile(inName, new Uint8Array(await file.arrayBuffer()));
		const code = await ffmpeg.exec(buildArgs(plan, inName, outName));
		if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);

		const data = await ffmpeg.readFile(outName);
		const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
		// Copy into a plain ArrayBuffer: readFile hands back a view that may sit
		// on the wasm heap (typed as possibly SharedArrayBuffer), which Blob
		// won't accept and which the next ffmpeg run would invalidate.
		const copy = new Uint8Array(bytes.length);
		copy.set(bytes);
		return new Blob([copy], { type: 'audio/mpeg' });
	} finally {
		ffmpeg.off('progress', handleProgress);
		signal?.removeEventListener('abort', onAbort);
		await ffmpeg.deleteFile(inName).catch(() => {});
		await ffmpeg.deleteFile(outName).catch(() => {});
	}
}

/**
 * Probe with ffmpeg by parsing its stderr banner -- cruder than Mediabunny's
 * metadata read, but the only option for containers Mediabunny won't open.
 */
export async function probeWithFfmpeg(
	file: File,
	onLoadProgress?: (fraction: number) => void
): Promise<SourceAudioInfo> {
	const ffmpeg = await getFfmpeg(onLoadProgress);
	const inName = `probe.${file.name.split('.').pop()?.toLowerCase() || 'bin'}`;

	let log = '';
	const collect = ({ message }: { message: string }) => {
		log += message + '\n';
	};
	ffmpeg.on('log', collect);

	try {
		await ffmpeg.writeFile(inName, new Uint8Array(await file.arrayBuffer()));
		// No output file: ffmpeg prints the stream info then exits non-zero.
		await ffmpeg.exec(['-i', inName]).catch(() => {});
	} finally {
		ffmpeg.off('log', collect);
		await ffmpeg.deleteFile(inName).catch(() => {});
	}

	const duration = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(log);
	const durationSec = duration
		? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])
		: 0;

	const hasAudio = /Stream #\d+:\d+.*?: Audio:/.test(log);
	const channels = /Audio:.*?(mono|stereo|(\d+) channels)/.exec(log);
	const sampleRate = /Audio:.*?(\d+)\s*Hz/.exec(log);

	return {
		durationSec: durationSec || 1,
		hasAudio,
		audioChannels: channels ? (channels[1] === 'mono' ? 1 : channels[2] ? Number(channels[2]) : 2) : 2,
		audioSampleRate: sampleRate ? Number(sampleRate[1]) : null
	};
}

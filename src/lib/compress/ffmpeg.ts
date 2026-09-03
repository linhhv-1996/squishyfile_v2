/**
 * ffmpeg.wasm engine — the compatibility path.
 *
 * Only loaded when Mediabunny can't read the container (AVI, WMV, FLV, MPEG-1/2
 * program streams, RealMedia, older 3GP variants...) or when the browser has no
 * usable H.264 encoder.
 *
 * Deliberately the **single-threaded** core build: the multi-threaded one needs
 * SharedArrayBuffer, which needs COOP/COEP headers, which would break the
 * static-hosting story (and third-party embeds) for the sake of files that are
 * rare and usually small. Slow but always works beats fast but sometimes 404s.
 *
 * The ~32 MB core is fetched lazily, on first use only, and then stored in the
 * Cache API so it survives reloads and new sessions — it is downloaded once per
 * browser, not once per visit.
 */
import type { CompressionPlan } from './plan';

const CORE_VERSION = '0.12.10';
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

/** Versioned so a core upgrade doesn't serve a stale wasm binary forever. */
const CACHE_NAME = `squishyfile-ffmpeg-core-${CORE_VERSION}`;

/**
 * Containers Mediabunny cannot demux. We check this up front so we don't pay
 * for a failed Mediabunny probe on files we already know it will reject.
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
 * Fetch a core asset, serving it from the Cache API when we've seen it before.
 *
 * The result has to become a same-origin blob: URL either way, because a
 * cross-origin script can't be used as a worker script — but the *download*
 * only ever happens once per browser, not once per page load.
 *
 * `onProgress` gets (receivedBytes, totalBytes); totalBytes is 0 when the
 * server sends no content-length.
 */
async function loadCoreAsset(
	url: string,
	mimeType: string,
	onProgress: (received: number, total: number) => void
): Promise<{ url: string; fromCache: boolean }> {
	// Cache API needs a secure context and can be disabled (private mode,
	// storage pressure). Every failure here is non-fatal: we just re-download.
	const cache = await caches.open(CACHE_NAME).catch(() => null);
	const hit = await cache?.match(url).catch(() => undefined);

	const response = hit ?? (await fetch(url));
	if (!response.ok) throw new Error(`Could not download ${url} (${response.status})`);

	// Store before consuming the body — clone() must happen while it's unread.
	if (!hit && cache) await cache.put(url, response.clone()).catch(() => {});

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

		// Sequential, not parallel: the JS glue is ~100 kB against ~32 MB of
		// wasm, so interleaving their progress would just make the bar jump.
		const core = await loadCoreAsset(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript', () => {});
		let cached = core.fromCache;

		const wasm = await loadCoreAsset(
			`${CORE_BASE}/ffmpeg-core.wasm`,
			'application/wasm',
			(received, total) => {
				if (total > 0) onLoadProgress?.(received / total, cached);
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

function buildArgs(plan: CompressionPlan, inName: string, outName: string): string[] {
	const args = ['-i', inName];

	// Video
	args.push('-c:v', 'libx264');
	// Single-threaded wasm is roughly two orders of magnitude slower than
	// native. veryfast keeps it tolerable; slower presets would buy ~10% size
	// at several times the wall-clock cost.
	args.push('-preset', 'veryfast');
	args.push('-pix_fmt', 'yuv420p');
	args.push('-vf', `scale=${plan.width}:${plan.height}:flags=bicubic`);
	args.push('-r', String(Math.round(plan.frameRate * 1000) / 1000));
	args.push('-g', String(Math.max(1, Math.round(plan.frameRate * plan.keyFrameInterval))));

	if (plan.mode === 'target' || plan.quantizer === null) {
		// Average bitrate with a rate-control buffer. -maxrate/-bufsize are what
		// actually stop a busy scene from spending the whole file's budget.
		const bv = plan.videoBitrate;
		args.push('-b:v', String(bv));
		args.push('-maxrate', String(Math.round(bv * 1.45)));
		args.push('-bufsize', String(Math.round(bv * 2)));
	} else {
		// x264's CRF is a touch more efficient than a flat QP, so aim ~1 lower
		// than the quantizer the WebCodecs path uses for the same level.
		args.push('-crf', String(Math.max(0, plan.quantizer - 1)));
		args.push('-maxrate', String(Math.round(plan.videoBitrate * 1.6)));
		args.push('-bufsize', String(Math.round(plan.videoBitrate * 2.4)));
	}

	// Audio
	if (plan.audioBitrate === null) {
		args.push('-an');
	} else {
		args.push('-c:a', 'aac');
		args.push('-b:a', String(plan.audioBitrate));
		args.push('-ac', String(plan.audioChannels || 2));
	}

	// Rewrite the index to the front so the result streams / previews instantly.
	args.push('-movflags', '+faststart');
	args.push(outName);
	return args;
}

export async function compressWithFfmpeg(
	file: File,
	plan: CompressionPlan,
	onProgress: (fraction: number) => void,
	onStage: (stage: 'loading' | 'encoding', fraction: number) => void,
	signal?: AbortSignal
): Promise<Blob> {
	onStage('loading', 0);
	const ffmpeg = await getFfmpeg((fraction) => onStage('loading', fraction));
	onStage('encoding', 0);

	const inName = `input.${file.name.split('.').pop()?.toLowerCase() || 'bin'}`;
	const outName = 'output.mp4';

	const handleProgress = ({ progress }: { progress: number }) => {
		if (Number.isFinite(progress)) onProgress(Math.min(1, Math.max(0, progress)));
	};
	ffmpeg.on('progress', handleProgress);

	const onAbort = () => ffmpeg.terminate();
	signal?.addEventListener('abort', onAbort, { once: true });

	try {
		await ffmpeg.writeFile(inName, new Uint8Array(await file.arrayBuffer()));
		const code = await ffmpeg.exec(buildArgs(plan, inName, outName));
		if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);

		const data = await ffmpeg.readFile(outName);
		const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
		// Copy into a plain ArrayBuffer: readFile hands back a view that may sit
		// on the wasm heap (typed as possibly SharedArrayBuffer), which Blob
		// won't accept, and which would be invalidated by the next ffmpeg run.
		const copy = new Uint8Array(bytes.length);
		copy.set(bytes);
		return new Blob([copy], { type: 'video/mp4' });
	} finally {
		ffmpeg.off('progress', handleProgress);
		signal?.removeEventListener('abort', onAbort);
		// Free the wasm heap — these files can be hundreds of megabytes and the
		// instance is reused for the next run.
		await ffmpeg.deleteFile(inName).catch(() => {});
		await ffmpeg.deleteFile(outName).catch(() => {});
	}
}

/**
 * Probe with ffmpeg by parsing its stderr banner. Cruder than Mediabunny's
 * metadata read, but it's the only option for containers Mediabunny won't open.
 */
export async function probeWithFfmpeg(file: File) {
	const ffmpeg = await getFfmpeg();
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

	const dims = /Video:.*?[,\s](\d{2,5})x(\d{2,5})[,\s]/.exec(log);
	const fps = /([\d.]+)\s*fps/.exec(log);
	const videoKbps = /Video:.*?,\s*(\d+)\s*kb\/s/.exec(log);
	const audioLine = /Stream #\d+:\d+.*?: Audio:/.exec(log);
	const channels = /Audio:.*?(mono|stereo|(\d+) channels)/.exec(log);

	return {
		durationSec: durationSec || 1,
		width: dims ? Number(dims[1]) : 1280,
		height: dims ? Number(dims[2]) : 720,
		frameRate: fps ? Number(fps[1]) : 30,
		videoBitrate: videoKbps ? Number(videoKbps[1]) * 1000 : null,
		totalBytes: file.size,
		hasAudio: audioLine !== null,
		audioChannels: channels ? (channels[1] === 'mono' ? 1 : channels[2] ? Number(channels[2]) : 2) : 2
	};
}

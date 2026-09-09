/**
 * ffmpeg.wasm engine -- the compatibility path for Frame Extractor.
 *
 * Handles containers Mediabunny can't demux (AVI, WMV, FLV, MPEG program
 * streams, ...). The core loader/cache below is deliberately self-contained
 * -- its own core loader, its own container list -- rather than importing
 * state from compress/ffmpeg.ts or video2mp3/ffmpeg.ts: this matches the
 * precedent video2mp3/ffmpeg.ts already set for this exact situation (see
 * its file header) -- separate feature folders each get their own engine
 * copy rather than reaching across folders for shared module state, since
 * this is an MPA where every route change is a full navigation anyway.
 *
 * Same single-threaded core build as the other tools, for the same reason:
 * the multi-threaded build needs SharedArrayBuffer, which needs COOP/COEP
 * headers, which would break static hosting and third-party embeds.
 *
 * Extraction strategy: one `-ss <t> -frames:v 1` ffmpeg invocation per
 * requested timestamp, rather than a single-pass filter graph (e.g.
 * `select`/`fps`) that would emit every frame in one exec call. This is the
 * simpler, more direct approach and it mirrors how this codebase already
 * favors straightforward per-call ffmpeg invocations over filter-graph
 * cleverness (see compress/ffmpeg.ts's buildArgs) -- at the cost of
 * re-seeking the file for every single timestamp, which is fine for the
 * frame counts this tool actually asks for (at most a few dozen) and is
 * only reached at all for legacy containers to begin with.
 */
import { planFrameTimestamps, type FrameExtractOptions, type SourceVideoInfo } from './plan';

const CORE_VERSION = '0.12.10';
// See the matching comment in compress/ffmpeg.ts: the ESM core build is
// required because @ffmpeg/ffmpeg's internal worker is always a module
// worker, and only the ESM core has the `export default` it needs.
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
 * Containers Mediabunny cannot demux -- the same boundary every other tool
 * in this codebase uses, duplicated here intentionally (see file header).
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
 * before. The Cache API is keyed by URL and shared across the whole
 * origin, so this cache entry is reused even if another tool's ffmpeg.ts
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

	// See the matching comment in compress/ffmpeg.ts for why this builds the
	// cache entry from the already-assembled blob rather than a
	// response.clone() taken before the read loop: cloning before the loop
	// starves the progress callback until the whole file has already
	// downloaded, so it looks stuck at 0% then jumps to 100%.
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

		onLoadProgress?.(0, false);

		const core = await loadCoreAsset(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript', () => {});
		let cached = core.fromCache;

		const wasm = await loadCoreAsset(
			`${CORE_BASE}/ffmpeg-core.wasm`,
			'application/wasm',
			(received, total) => {
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

/**
 * JPEG quality (1-100, higher = better) to ffmpeg's `-q:v` mjpeg/image
 * qscale (2-31, LOWER = better). PNG ignores this entirely -- it's
 * lossless, there's no dial to turn.
 */
function qualityToQScale(quality: number): number {
	const q = Math.min(100, Math.max(1, quality));
	return Math.round(31 - (q / 100) * 29);
}

function buildFrameArgs(inName: string, outName: string, timestampSec: number, options: FrameExtractOptions): string[] {
	const args = [
		// -ss before -i: fast (keyframe-seek-assisted) seeking. Good enough
		// for "grab me a still around this time" -- the same tradeoff this
		// tool already accepts from Mediabunny's own timestamp-to-canvas
		// mapping, which likewise snaps to the frame at-or-before the
		// requested time rather than guaranteeing frame-exact precision.
		'-ss',
		timestampSec.toFixed(3),
		'-i',
		inName,
		'-frames:v',
		'1'
	];
	if (options.format === 'jpeg') {
		args.push('-q:v', String(qualityToQScale(options.jpegQuality)));
	}
	args.push(outName);
	return args;
}

export type ExtractedFrame = { timestampSec: number; blob: Blob };

export async function extractFramesWithFfmpeg(
	file: File,
	source: SourceVideoInfo,
	options: FrameExtractOptions,
	onProgress: (fraction: number) => void,
	onStage: (stage: 'loading' | 'encoding', fraction: number) => void,
	signal?: AbortSignal
): Promise<ExtractedFrame[]> {
	onStage('loading', 0);
	const ffmpeg = await getFfmpeg((fraction) => onStage('loading', fraction));
	onStage('encoding', 0);

	const timestamps = planFrameTimestamps(source, options);
	const inExt = file.name.split('.').pop()?.toLowerCase() || 'bin';
	const inName = `input.${inExt}`;
	const outExt = options.format === 'png' ? 'png' : 'jpg';
	const mimeType = options.format === 'png' ? 'image/png' : 'image/jpeg';

	// See the matching comment in compress/ffmpeg.ts: terminate() permanently
	// kills the internal worker, so the module-level singleton must be
	// cleared too, or the next extraction reuses a dead instance and fails
	// immediately with "ffmpeg is not loaded".
	const onAbort = () => {
		ffmpeg.terminate();
		if (instance === ffmpeg) instance = null;
	};
	signal?.addEventListener('abort', onAbort, { once: true });

	const frames: ExtractedFrame[] = [];
	try {
		await ffmpeg.writeFile(inName, new Uint8Array(await file.arrayBuffer()));

		for (let i = 0; i < timestamps.length; i++) {
			if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

			const outName = `frame_out_${i}.${outExt}`;
			const code = await ffmpeg.exec(buildFrameArgs(inName, outName, timestamps[i], options));
			if (code !== 0) {
				throw new Error(`ffmpeg exited with code ${code} extracting the frame at ${timestamps[i]}s`);
			}

			const data = await ffmpeg.readFile(outName);
			const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
			// Copy into a plain ArrayBuffer, same reasoning as every other
			// engine here: readFile's view may sit on the wasm heap and would
			// be invalidated by the next ffmpeg call.
			const copy = new Uint8Array(bytes.length);
			copy.set(bytes);
			frames.push({ timestampSec: timestamps[i], blob: new Blob([copy], { type: mimeType }) });

			await ffmpeg.deleteFile(outName).catch(() => {});
			onProgress((i + 1) / timestamps.length);
		}
	} finally {
		signal?.removeEventListener('abort', onAbort);
		await ffmpeg.deleteFile(inName).catch(() => {});
	}

	if (frames.length === 0) throw new Error('No frames could be extracted from this video');
	return frames;
}

/**
 * Probe with ffmpeg by parsing its stderr banner -- cruder than Mediabunny's
 * metadata read, but the only option for containers Mediabunny won't open.
 */
export async function probeWithFfmpeg(
	file: File,
	onLoadProgress?: (fraction: number) => void
): Promise<SourceVideoInfo> {
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

	const dims = /Video:.*?[,\s](\d{2,5})x(\d{2,5})[,\s]/.exec(log);

	return {
		durationSec: durationSec || 1,
		width: dims ? Number(dims[1]) : 1280,
		height: dims ? Number(dims[2]) : 720
	};
}

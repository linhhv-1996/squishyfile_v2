/**
 * Caches onnxruntime-web's WASM/JS runtime files (fetched from the jsdelivr
 * CDN -- see `env.wasm.wasmPaths` in upscale.worker.ts) in the browser's
 * Cache Storage, so repeat visits/tool switches don't re-download several MB
 * of runtime on every worker startup. Also reports byte-level download
 * progress for the .wasm binary while a caller has opted in via
 * `beginOrtDownloadTracking()` -- see the block comment above that function
 * for why this exists and why only the .wasm file is tracked.
 *
 * Not present in the reference sample_code dump this tool was built from
 * (imdn-worker.ts etc. all `import { setupWasmCache } from './ort-wasm-cache'`
 * without shipping it) -- this is a minimal implementation of what that
 * import name implies: wrap self.fetch so cross-origin requests for the ORT
 * runtime go through the Cache API first.
 */

const CACHE_NAME = 'ort-wasm-cache-v1';

/**
 * Fallback total (bytes) for progress when the response is content-encoded.
 * jsdelivr serves onnxruntime-web@1.27.0's wasm binary brotli-compressed --
 * Content-Length then describes the ~4.9 MB *wire* size, not the ~23.1 MB
 * *decoded* size `received` below actually counts (fetch() decompresses
 * before this loop ever sees the stream). Measured via the browser's
 * devtools Network panel (decoded/"Content" size for
 * ort-wasm-simd-threaded.jsep.wasm on this onnxruntime-web version) -- only
 * needs to be in the right ballpark, same as
 * `$lib/compress/ffmpeg.ts`'s FFMPEG_WASM_ESTIMATED_BYTES, since the loop
 * never lets an estimate claim "done" on its own (capped below 1; see the
 * `onProgress(1)` call after the loop for the real completion signal).
 */
const ORT_WASM_DECODED_ESTIMATE_BYTES = 23.1 * 1024 * 1024;

let installed = false;

/**
 * Registered by a caller (see `loadImdnModel` in upscale.worker.ts) while it
 * wants the ORT wasm binary's download reported. `null` between calls, so a
 * normal page load (or a repeat load once everything's cached) pays zero
 * overhead for the tracked read-loop below and just uses the plain
 * clone-and-cache path.
 *
 * Only the `.wasm` request is tracked, deliberately -- onnxruntime-web also
 * fetches a small `.mjs`/`.js` glue file alongside it, tens of KB against
 * several MB for the wasm binary. Folding both into one running total (by
 * bytes) means whichever request happens to finish first yanks the visible
 * fraction around: if the small glue file finishes first its few KB briefly
 * read as "100%", then the real wasm total gets added and the fraction
 * drops back down before climbing again -- looks exactly as broken as it
 * is. `$lib/compress/ffmpeg.ts`'s loadCoreAsset hits the identical shape
 * (core.js vs core.wasm) and solves it the same way: give the small file's
 * progress callback nothing to do and only report the dominant binary's
 * real bytes. There's exactly one `.wasm` request per engine load here, so
 * "only track .wasm" needs no bookkeeping across multiple files at all.
 */
let onProgress: ((fraction: number) => void) | null = null;

/**
 * Start reporting real download progress (0-1) for the next ORT wasm binary
 * fetch. Computed from real bytes as they arrive -- `received` below, never
 * a step counter or a timer -- but the denominator isn't simply
 * `response.headers.get('content-length')`: see `ORT_WASM_DECODED_ESTIMATE_BYTES`
 * above for why. Short version: `fetch()` hands this loop *decoded* bytes
 * once the response is content-encoded (brotli, here), but Content-Length
 * describes the *encoded* (wire) size -- two different numbers for two
 * different things, not a question of whether compression "matters" to the
 * download. There's no JS-observable count of encoded bytes while a stream
 * is still in flight (Accept-Encoding can't be overridden to request
 * identity encoding, and the one API that reports true wire size --
 * Resource Timing's `transferSize` -- only exists after the request has
 * already finished), so an encoded response falls back to a fixed estimate
 * of the decoded size instead of the mismatched header value.
 *
 * Either way, the read loop below never lets the in-progress fraction it
 * reports reach 1 -- it caps at 0.99 and only the caller sees a real 1 once
 * the stream has actually, fully drained (see the `onProgress(1)` call after
 * the loop). That's what keeps a wrong-by-some-margin estimate from ever
 * claiming "finished" early: the bar climbs off real bytes against a
 * best-guess total, but only `done` from the reader gets to say "done".
 */
export function beginOrtDownloadTracking(handler: (fraction: number) => void): void {
	onProgress = handler;
}

export function endOrtDownloadTracking(): void {
	onProgress = null;
}

export function setupWasmCache(): void {
	if (installed) return;
	installed = true;

	// No Cache Storage available (very old browser, or a non-worker/non-window
	// context) -- silently no-op, onnxruntime-web just fetches normally.
	if (typeof caches === 'undefined') return;

	const originalFetch = self.fetch.bind(self);

	self.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const request = input instanceof Request ? input : new Request(input, init);

		// Only intercept ORT's own runtime asset requests (.wasm/.mjs/.js
		// fetched from the CDN configured via env.wasm.wasmPaths) -- anything
		// else (e.g. the video file itself, same-origin app assets) goes
		// straight through untouched.
		let url: URL;
		try {
			url = new URL(request.url);
		} catch {
			return originalFetch(input as RequestInfo, init);
		}
		const isOrtAsset =
			/\/onnxruntime-web@/.test(url.pathname) && /\.(wasm|mjs|js)(\?.*)?$/.test(url.pathname);
		if (!isOrtAsset || request.method !== 'GET') {
			return originalFetch(input as RequestInfo, init);
		}
		// Progress is only ever reported for the dominant .wasm binary -- see
		// the comment on `onProgress` above for why the small glue file is
		// deliberately excluded rather than folded into the same total.
		const isTrackableAsset = /\.wasm(\?.*)?$/.test(url.pathname);

		try {
			const cache = await caches.open(CACHE_NAME);
			const cached = await cache.match(request);
			if (cached) {
				// Already have it -- nothing to download, so nothing to report;
				// onnxruntime-web gets the cached bytes instantly either way.
				return cached;
			}

			const response = await originalFetch(request);
			if (!response.ok) return response;

			// Content-Length means two different things depending on whether the
			// response is content-encoded -- see the block comment on
			// beginOrtDownloadTracking above. Uncompressed, it's exactly the byte
			// count `received` below will count up to, so use it directly.
			// Compressed, it's the wire size, not the decoded size this loop
			// actually measures, so it's the wrong number entirely -- fall back
			// to the fixed decoded-size estimate instead of a total that would
			// make `received` sail past it early.
			const contentEncoding = response.headers.get('content-encoding');
			const isEncoded = !!contentEncoding && contentEncoding.toLowerCase() !== 'identity';
			const contentLength = Number(response.headers.get('content-length')) || 0;
			const total = isEncoded ? ORT_WASM_DECODED_ESTIMATE_BYTES : contentLength;

			if (!onProgress || !isTrackableAsset || total === 0) {
				// Either no one's listening for progress, this isn't the file we
				// track, or the server didn't send a real size for it -- in the
				// last case we still download it fine, we just can't honestly
				// report a percentage for it (see the module doc above), so
				// skip the tracked read-loop and use the cheap clone-and-cache
				// path.
				cache.put(request, response.clone()).catch(() => {
					// Storage quota errors etc. are non-fatal -- just means no
					// caching this time.
				});
				return response;
			}

			// Read the network stream ourselves, chunk by chunk, so onProgress
			// fires with real bytes-over-real-total as they actually arrive --
			// then hand back an equivalent Response built from what we read,
			// and populate the cache from that same in-memory copy afterwards.
			//
			// Deliberately NOT response.clone() + cache.put() before reading,
			// the way the branch above does it: clone() tees the stream, and
			// cache.put() awaits until it has fully drained its side of the
			// tee to store it. Awaiting that *before* this function's own
			// read loop had pulled a single byte would let the whole file
			// pile up in the tee's internal buffer unseen, so onProgress
			// would only ever fire once the download was already finished --
			// exactly the "stuck at 0%, then jumps to 100%" bug this exists
			// to avoid (see the analogous fix in `$lib/compress/ffmpeg.ts`'s
			// loadCoreAsset for the original case).
			const reader = response.body!.getReader();
			const chunks: Uint8Array[] = [];
			let received = 0;
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
				received += value.length;
				// Capped below 1 -- see the block comment on beginOrtDownloadTracking
				// above for why `received / total` can legitimately exceed 1 well
				// before the stream is actually done (compressed Content-Length vs
				// decoded byte count) and why only the `done` branch below is
				// allowed to report completion.
				onProgress(Math.min(0.99, received / total));
			}
			// Every byte is in now (reader signaled `done`), so this is the one
			// place allowed to report 100% -- real completion, not an artifact of
			// `total` under-describing the decoded size.
			onProgress(1);
			const body = new Blob(chunks as BlobPart[]);

			const rebuilt = new Response(body, {
				status: response.status,
				statusText: response.statusText,
				headers: response.headers
			});
			cache.put(request, rebuilt.clone()).catch(() => {
				// Storage quota errors etc. are non-fatal -- just means no
				// caching this time.
			});
			return rebuilt;
		} catch {
			// Cache Storage unavailable/blocked (e.g. private browsing in some
			// browsers) -- fall back to a plain network fetch.
			return originalFetch(request);
		}
	};
}

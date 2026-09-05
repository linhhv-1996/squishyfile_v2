/**
 * Caches onnxruntime-web's WASM/JS runtime files (fetched from the jsdelivr
 * CDN -- see `env.wasm.wasmPaths` in upscale.worker.ts) in the browser's
 * Cache Storage, so repeat visits/tool switches don't re-download several MB
 * of runtime on every worker startup.
 *
 * Not present in the reference sample_code dump this tool was built from
 * (imdn-worker.ts etc. all `import { setupWasmCache } from './ort-wasm-cache'`
 * without shipping it) -- this is a minimal implementation of what that
 * import name implies: wrap self.fetch so cross-origin requests for the ORT
 * runtime go through the Cache API first.
 */

const CACHE_NAME = 'ort-wasm-cache-v1';

let installed = false;

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

		try {
			const cache = await caches.open(CACHE_NAME);
			const cached = await cache.match(request);
			if (cached) return cached;

			const response = await originalFetch(request);
			if (response.ok) {
				// Cache a clone -- the original body stream is still needed by
				// the caller (onnxruntime-web reads it as arrayBuffer()).
				cache.put(request, response.clone()).catch(() => {
					// Storage quota errors etc. are non-fatal -- just means no
					// caching this time.
				});
			}
			return response;
		} catch {
			// Cache Storage unavailable/blocked (e.g. private browsing in some
			// browsers) -- fall back to a plain network fetch.
			return originalFetch(request);
		}
	};
}

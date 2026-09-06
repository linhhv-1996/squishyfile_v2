// onnxruntime-web ships local copies of its WASM runtime under
// node_modules/onnxruntime-web/dist/. This app never uses them: every
// worker that loads onnxruntime-web sets `env.wasm.wasmPaths` to jsdelivr's
// CDN before creating an inference session (see src/lib/components/tool/
// ort-wasm-cache.ts), so onnxruntime-web's own `locateFile` override always
// wins and the local files are dead weight -- fetched by nobody.
//
// The problem: onnxruntime-web's glue code still contains a
// `new URL('ort-wasm-*.wasm', import.meta.url)` fallback reference for each
// variant. Vite's static asset scanner bundles whatever that literal points
// to regardless of whether the branch runs, so a production build ships the
// real 13-27MB binaries as client assets -- and Cloudflare's Workers assets
// uploader rejects any single file over 25 MiB ("Asset too large").
//
// Fix: after every `npm install`, overwrite these four files with a
// minimal-but-valid WASM module (just the magic number + version header).
// Vite then bundles an 8-byte stub instead of a 25MB binary. Safe because
// the real file is never fetched at runtime -- see above.
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../node_modules/onnxruntime-web/dist');

const files = [
	'ort-wasm-simd-threaded.wasm',
	'ort-wasm-simd-threaded.jsep.wasm',
	'ort-wasm-simd-threaded.jspi.wasm',
	'ort-wasm-simd-threaded.asyncify.wasm'
];

// Minimal valid WASM module: magic number (\0asm) + version (1).
const stub = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

for (const file of files) {
	const filePath = path.join(distDir, file);
	if (!existsSync(filePath)) {
		// onnxruntime-web isn't installed (or restructured its dist layout) --
		// nothing to stub, don't fail the install over it.
		continue;
	}
	writeFileSync(filePath, stub);
	console.log(`[stub-onnx-wasm] stubbed ${file}`);
}

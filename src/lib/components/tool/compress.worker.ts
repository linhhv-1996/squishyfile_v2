/// <reference lib="webworker" />

/**
 * Compression orchestrator. Runs off the main thread so the UI stays
 * responsive through what can be several minutes of encoding.
 *
 * Responsibilities:
 *   1. Probe the source and route it to an engine
 *      (Mediabunny for modern containers, ffmpeg.wasm for the rest).
 *   2. Ask the planner what to encode at.
 *   3. In target-size mode, verify the result and re-encode if we missed.
 */
import {
	correctTargetBytes,
	planForLevel,
	planForTargetSize,
	type CompressionLevel,
	type CompressionPlan,
	type PlanWarning,
	type SourceInfo
} from '$lib/compress/plan';
import {
	canEncodeVideoNatively,
	compressWithMediabunny,
	probe as probeWithMediabunny,
	UnsupportedByMediabunnyError
} from '$lib/compress/mediabunny';
import { compressWithFfmpeg, needsFfmpeg, probeWithFfmpeg } from '$lib/compress/ffmpeg';
import { ConversionCanceledError } from 'mediabunny';

export type CompressRequest = {
	type: 'compress';
	file: File;
	level: CompressionLevel;
	targetSizeMB: number | null;
};

export type CancelRequest = { type: 'cancel' };

export type CompressProgressMessage = {
	type: 'progress';
	/** 0-100, within the current pass. */
	progress: number;
	stage: 'probing' | 'loading-engine' | 'encoding';
	/** 1-based; >1 means we're correcting a target-size miss. */
	pass: number;
};

export type CompressDoneMessage = {
	type: 'done';
	blob: Blob;
	fileName: string;
	originalBytes: number;
	compressedBytes: number;
	savedPercent: number;
	width: number;
	height: number;
	frameRate: number;
	engine: 'mediabunny' | 'ffmpeg';
	passes: number;
	/** True when a target size was requested and the output is at or under it. */
	targetMet: boolean | null;
	warnings: PlanWarning[];
};

export type CompressErrorMessage = { type: 'error'; message: string };

export type WorkerOutMessage =
	| CompressProgressMessage
	| CompressDoneMessage
	| CompressErrorMessage;

const MB = 1024 * 1024;

let abortController: AbortController | null = null;

function post(message: WorkerOutMessage) {
	self.postMessage(message);
}

function outputName(original: string): string {
	const base = original.replace(/\.[^.]+$/, '') || 'video';
	return `${base}-squished.mp4`;
}

type Engine = 'mediabunny' | 'ffmpeg';

async function resolveEngineAndSource(
	file: File
): Promise<{ engine: Engine; source: SourceInfo }> {
	// Known-unsupported containers: skip the Mediabunny attempt entirely.
	if (needsFfmpeg(file.name)) {
		return { engine: 'ffmpeg', source: await probeWithFfmpeg(file) };
	}

	try {
		const source = await probeWithMediabunny(file);
		// Reading it is only half the battle — a browser can demux more than
		// it can encode. But this is the ONLY reason a readable container ever
		// goes to ffmpeg: if H.264 encoding works, Mediabunny handles it.
		if (await canEncodeVideoNatively()) return { engine: 'mediabunny', source };
		return { engine: 'ffmpeg', source };
	} catch (error) {
		if (error instanceof UnsupportedByMediabunnyError) {
			return { engine: 'ffmpeg', source: await probeWithFfmpeg(file) };
		}
		throw error;
	}
}

async function runPass(
	engine: Engine,
	file: File,
	plan: CompressionPlan,
	pass: number,
	signal: AbortSignal
): Promise<Blob> {
	const onProgress = (fraction: number) =>
		post({
			type: 'progress',
			progress: Math.round(fraction * 100),
			stage: 'encoding',
			pass
		});

	if (engine === 'mediabunny') {
		return compressWithMediabunny(file, plan, onProgress, signal);
	}
	return compressWithFfmpeg(
		file,
		plan,
		onProgress,
		(stage, fraction) =>
			post({
				type: 'progress',
				progress: Math.round(fraction * 100),
				stage: stage === 'loading' ? 'loading-engine' : 'encoding',
				pass
			}),
		signal
	);
}

async function compress(request: CompressRequest) {
	const { file, level, targetSizeMB } = request;

	abortController?.abort();
	abortController = new AbortController();
	const { signal } = abortController;

	post({ type: 'progress', progress: 0, stage: 'probing', pass: 1 });
	const { engine, source } = await resolveEngineAndSource(file);

	const desiredBytes = targetSizeMB ? targetSizeMB * MB : null;

	let pass = 1;
	// The byte figure we *plan* against. It drifts away from `desiredBytes`
	// across passes as we learn how far this particular clip overshoots.
	let planningBytes = desiredBytes;
	let plan!: CompressionPlan;
	let blob!: Blob;

	for (;;) {
		plan =
			planningBytes !== null
				? planForTargetSize(source, planningBytes)
				: planForLevel(source, level);

		blob = await runPass(engine, file, plan, pass, signal);

		if (desiredBytes === null || planningBytes === null) {
			// Constant-quality encoding has no size ceiling: a grainy or
			// already-efficient source can come out *larger* than it went in,
			// which would make the whole tool look broken. If that happens,
			// redo the pass in bitrate mode, where the planner's number is a
			// hard budget.
			if (plan.quantizer !== null && blob.size >= file.size * 0.98 && pass === 1) {
				pass += 1;
				plan = { ...plan, quantizer: null };
				blob = await runPass(engine, file, plan, pass, signal);
			}
			break;
		}

		const next = correctTargetBytes(
			planningBytes,
			blob.size,
			desiredBytes,
			pass,
			plan.cappedBySource
		);
		if (next === null) break;

		planningBytes = next;
		pass += 1;
	}

	const savedPercent = Math.max(0, Math.round((1 - blob.size / file.size) * 100));

	post({
		type: 'done',
		blob,
		fileName: outputName(file.name),
		originalBytes: file.size,
		compressedBytes: blob.size,
		savedPercent,
		width: plan.width,
		height: plan.height,
		frameRate: Math.round(plan.frameRate),
		engine,
		passes: pass,
		targetMet: desiredBytes === null ? null : blob.size <= desiredBytes,
		warnings: plan.warnings
	});
}

self.onmessage = (event: MessageEvent<CompressRequest | CancelRequest>) => {
	const data = event.data;

	if (data.type === 'cancel') {
		abortController?.abort();
		abortController = null;
		return;
	}

	if (data.type !== 'compress') return;

	compress(data).catch((error: unknown) => {
		if (signalWasAborted(error)) return;
		post({
			type: 'error',
			message: error instanceof Error ? error.message : 'Compression failed'
		});
	});
};

function signalWasAborted(error: unknown): boolean {
	if (error instanceof ConversionCanceledError) return true;
	return error instanceof DOMException && error.name === 'AbortError';
}

export {};

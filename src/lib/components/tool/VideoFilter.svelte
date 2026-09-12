<script lang="ts">
	// The tool UI. Two independent pipelines share one shader (see
	// $lib/vhs/gl-renderer.ts):
	//  1. A live preview -- a <video> playing the source file with a
	//     <canvas> drawn on top of it every frame via the same WebGL2
	//     shader, running right here on the main thread, with its own
	//     small play/pause/seek/mute player bar. This is what lets picking
	//     a style show its look immediately, with no wait, and lets the
	//     user scrub to any moment to check how the effect looks there.
	//  2. The actual export -- videofilter.worker.ts, off the main thread, which
	//     decodes/re-encodes the full-resolution video (and its audio,
	//     untouched) through Mediabunny and hands back a downloadable file.
	// The preview never touches the worker and vice versa -- they're two
	// separate GL contexts rendering the same shader independently.
	import { onDestroy, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { getStrings } from '$lib/i18n';
	import ShareRow from '$lib/components/share/ShareRow.svelte';
	import SupportLink from '$lib/components/support/SupportLink.svelte';
		import { VHS_STYLES, type VhsStyle } from '$lib/vhs/plan';
	import { VhsRenderer } from '$lib/vhs/gl-renderer';
	import type { WorkerOutMessage } from './videofilter.worker';
	import { trackEvent, roundMb } from '$lib/analytics';

	let { shareTitle = '' }: { shareTitle?: string } = $props();

	const t = getStrings();

	const TOOL = 'vhs';
	function track(action: string, params: Record<string, string | number | boolean | undefined> = {}) {
		trackEvent(`tool_${TOOL}_${action}`, params);
	}
	// Set when a run starts so the success event can report how long it took.
	let convertStartedAt = 0;

	type Stage = 'probing' | 'encoding';

	let file = $state<File | null>(null);
	let isDragging = $state(false);
	let style = $state<VhsStyle>('classic');
	// Captured when a run starts -- shown in the result panel even if the
	// user fiddles with the style picker afterwards.
	let usedStyle = $state<VhsStyle>('classic');
	let status = $state<'idle' | 'processing' | 'done' | 'error'>('idle');
	let progress = $state(0);
	let stage = $state<Stage>('probing');
	let errorMessage = $state('');
	let fileInputEl = $state<HTMLInputElement>();
	let isSampleLoading = $state(false);
	let resultEl = $state<HTMLDivElement>();

	// ---------------------------------------------------------------------
	// Live preview: plays `file` in a hidden <video> and draws every frame
	// through the shader onto a visible <canvas>, with a small player bar
	// (play/pause, seek, mute) driving that same <video> directly.
	// ---------------------------------------------------------------------
	let livePreviewUrl = $state<string | null>(null);
	let previewMuted = $state(true);
	let isPlaying = $state(false);
	let currentTime = $state(0);
	let duration = $state(0);
	let videoEl = $state<HTMLVideoElement>();
	let canvasEl = $state<HTMLCanvasElement>();
	let previewRenderer: VhsRenderer | null = null;
	let previewLoopHandle: number | null = null;
	let previewLoopUsesVfc = false;

	function stopPreviewLoop() {
		if (previewLoopHandle === null) return;
		if (previewLoopUsesVfc && videoEl && 'cancelVideoFrameCallback' in videoEl) {
			(videoEl as HTMLVideoElement & { cancelVideoFrameCallback: (h: number) => void }).cancelVideoFrameCallback(
				previewLoopHandle
			);
		} else {
			cancelAnimationFrame(previewLoopHandle);
		}
		previewLoopHandle = null;
	}

	function renderCurrentFrame() {
		if (!videoEl || !canvasEl || !videoEl.videoWidth || !videoEl.videoHeight) return;
		try {
			if (!previewRenderer) previewRenderer = new VhsRenderer(canvasEl);
			previewRenderer.render(videoEl, videoEl.videoWidth, videoEl.videoHeight, style, videoEl.currentTime);
		} catch (err) {
			// WebGL2 unsupported or context lost -- stop trying every frame,
			// the tool still works via the "Render & download" path below.
			console.error('[VideoFilter] live preview render failed:', err);
			stopPreviewLoop();
		}
	}

	function loopTick() {
		renderCurrentFrame();
		scheduleNextPreviewFrame();
	}

	function scheduleNextPreviewFrame() {
		if (!videoEl) return;
		if ('requestVideoFrameCallback' in videoEl) {
			previewLoopUsesVfc = true;
			previewLoopHandle = (
				videoEl as HTMLVideoElement & { requestVideoFrameCallback: (cb: () => void) => number }
			).requestVideoFrameCallback(loopTick);
		} else {
			previewLoopUsesVfc = false;
			previewLoopHandle = requestAnimationFrame(loopTick);
		}
	}

	function onLoadedMetadata() {
		duration = videoEl?.duration ?? 0;
		// Draw the still first frame immediately regardless of autoplay, so
		// there's always something on screen even if the browser blocks
		// autoplay -- the player bar's play button still works from there.
		renderCurrentFrame();
		videoEl?.play().catch(() => {
			/* autoplay blocked -- user can press play manually */
		});
	}

	function onVideoPlay() {
		isPlaying = true;
		scheduleNextPreviewFrame();
	}

	function onVideoPause() {
		isPlaying = false;
		stopPreviewLoop();
	}

	function onVideoTimeUpdate() {
		if (videoEl) currentTime = videoEl.currentTime;
	}

	function onVideoSeeked() {
		if (videoEl) currentTime = videoEl.currentTime;
		renderCurrentFrame();
	}

	function togglePlay() {
		if (!videoEl) return;
		if (videoEl.paused || videoEl.ended) {
			videoEl.play().catch(() => {});
		} else {
			videoEl.pause();
		}
	}

	function onSeekInput(event: Event) {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		currentTime = value;
		if (videoEl) videoEl.currentTime = value;
	}

	function formatTime(seconds: number): string {
		if (!isFinite(seconds) || seconds < 0) return '0:00';
		const total = Math.floor(seconds);
		const m = Math.floor(total / 60);
		const s = total % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	function teardownPreview() {
		stopPreviewLoop();
		if (livePreviewUrl) URL.revokeObjectURL(livePreviewUrl);
		livePreviewUrl = null;
		previewRenderer = null;
		isPlaying = false;
		currentTime = 0;
		duration = 0;
	}

	let worker: Worker | undefined;

	// Created on first use, not on page load -- the worker bundles
	// Mediabunny, and most visitors reading the page below never touch the
	// tool.
	function getWorker(): Worker | undefined {
		if (!browser) return undefined;
		if (worker) return worker;

		worker = new Worker(new URL('./videofilter.worker.ts', import.meta.url), {
			type: 'module'
		});
		worker.onerror = (event: ErrorEvent) => {
			console.error('[VideoFilter] worker crashed:', event.message, event);
			status = 'error';
			errorMessage = t.toolVhs.errors.generic;
			track('convert_error', { error_code: 'worker_crash' });
		};
		worker.onmessageerror = (event: MessageEvent) => {
			console.error('[VideoFilter] worker message could not be deserialized:', event);
		};
		worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
			const data = event.data;

			if (data.type === 'progress') {
				progress = data.progress;
				stage = data.stage;
				return;
			}

			if (data.type === 'error') {
				console.error('[VideoFilter] worker reported an error:', data.message);
				status = 'error';
				errorMessage = t.toolVhs.errors.generic;
				track('convert_error', { error_code: 'worker_error' });
				return;
			}

			// done
			progress = 100;
			revokeResult();
			result = {
				url: URL.createObjectURL(data.blob),
				fileName: data.fileName,
				originalBytes: data.originalBytes,
				newBytes: data.newBytes,
				width: data.width,
				height: data.height,
				style: data.style
			};
			status = 'done';
			track('convert_success', {
				duration_ms: Date.now() - convertStartedAt,
				original_size_mb: roundMb(data.originalBytes),
				result_size_mb: roundMb(data.newBytes),
				style: data.style
			});
			tick().then(() => resultEl?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
		};

		return worker;
	}

	let result = $state<{
		url: string;
		fileName: string;
		originalBytes: number;
		newBytes: number;
		width: number;
		height: number;
		style: VhsStyle;
	} | null>(null);

	function revokeResult() {
		if (result) URL.revokeObjectURL(result.url);
		result = null;
	}

	onDestroy(() => {
		revokeResult();
		teardownPreview();
		worker?.terminate();
	});

	function reset() {
		status = 'idle';
		progress = 0;
		stage = 'probing';
		errorMessage = '';
		revokeResult();
	}

	function handleFile(next: File | null | undefined, method: 'browse' | 'drop' | 'sample' = 'browse') {
		if (!next) return;
		file = next;
		reset();
		teardownPreview();
		livePreviewUrl = URL.createObjectURL(next);
		track('file_added', { method, file_size_mb: roundMb(next.size) });
	}

	function onFileInputChange(event: Event) {
		handleFile((event.currentTarget as HTMLInputElement).files?.[0]);
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		isDragging = false;
		if (isBusy) return;
		handleFile(event.dataTransfer?.files?.[0], 'drop');
	}

	function onDragOver(event: DragEvent) {
		event.preventDefault();
		if (isBusy) return;
		isDragging = true;
	}

	function onDragLeave(event: DragEvent) {
		event.preventDefault();
		isDragging = false;
	}

	// While a job is running the input file is locked -- swapping or clearing
	// it mid-run would leave the worker producing a result for a file the
	// user can no longer see. Cancel first, then change the file. The live
	// preview stays interactive throughout, since it never touches the
	// worker.
	const isBusy = $derived(status === 'processing' || isSampleLoading);

	function onDropzoneClick(event: MouseEvent) {
		if (isBusy) return;
		if ((event.target as HTMLElement).closest('button')) return;
		fileInputEl?.click();
	}

	function onDropzoneKeydown(event: KeyboardEvent) {
		if (isBusy) return;
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			fileInputEl?.click();
		}
	}

	// Used from the "done" result panel to start over with a new file,
	// without requiring the isBusy guard (the run already finished).
	function processAnother() {
		if (fileInputEl) fileInputEl.value = '';
		file = null;
		reset();
		teardownPreview();
		track('reset');
	}

	async function loadSample() {
		if (isBusy) return;
		isSampleLoading = true;
		try {
			const response = await fetch('/7687598-hd_1280_720_30fps.mp4');
			if (!response.ok) throw new Error('sample fetch failed');
			const blob = await response.blob();
			handleFile(new File([blob], '7687598-hd_1280_720_30fps.mp4', { type: 'video/mp4' }), 'sample');
		} catch {
			status = 'error';
			errorMessage = t.toolVhs.errors.generic;
			track('convert_error', { error_code: 'sample_fetch_failed' });
		} finally {
			isSampleLoading = false;
		}
	}

	function startProcessing() {
		const activeWorker = getWorker();
		if (!file || !activeWorker) return;
		reset();
		usedStyle = style;
		status = 'processing';
		stage = 'probing';
		convertStartedAt = Date.now();
		track('convert_start', { style });
		activeWorker.postMessage({ type: 'process', file, style });
	}

	function cancelProcessing() {
		track('convert_cancel');
		worker?.postMessage({ type: 'cancel' });
		reset();
	}

	const progressLabel = $derived.by(() => {
		if (status === 'done') return t.toolVhs.progress.done;
		if (stage === 'probing') return t.toolVhs.progress.probing;
		return t.toolVhs.progress.encoding;
	});

	function selectStyle(next: VhsStyle) {
		style = next;
		// While paused, nothing else redraws the canvas -- the preview loop
		// (which normally picks up style changes on the next scheduled
		// frame) is stopped. Redraw the current frame right away so the new
		// filter shows immediately instead of only on the next play/seek.
		if (!isPlaying) renderCurrentFrame();
	}

	function styleLabel(s: VhsStyle) {
		return t.toolVhs.style.options[s];
	}

	function styleDescription(s: VhsStyle) {
		return t.toolVhs.style.descriptions[s];
	}

	function formatSize(bytes: number) {
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	}

	function fill(template: string, values: Record<string, string | number>) {
		return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
	}
</script>

<div class="tool-card">
	<div
		class="dropzone"
		class:is-drag={isDragging}
		class:is-locked={isBusy}
		class:has-file={file !== null}
		role="button"
		aria-disabled={isBusy}
		tabindex={isBusy ? -1 : 0}
		onclick={onDropzoneClick}
		onkeydown={onDropzoneKeydown}
		ondrop={onDrop}
		ondragover={onDragOver}
		ondragleave={onDragLeave}
	>
		{#if isSampleLoading}
			<div class="dz-overlay">
				<span class="dz-spinner" aria-hidden="true"></span>
			</div>
		{/if}
		<span class="icon">
			<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M12 16V4M12 4l-4 4M12 4l4 4" />
				<path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
			</svg>
		</span>
		<div class="dz-text">
			<p class="dz-title">
				{t.toolVhs.dropzone.titlePrefix}
				<button type="button" disabled={isBusy} onclick={() => fileInputEl?.click()}>
					{t.toolVhs.dropzone.browse}
				</button>
			</p>
			<p class="dz-sub">
				{t.toolVhs.dropzone.subtitle}
				<button type="button" class="dz-sample" disabled={isBusy} onclick={loadSample}>
					{t.toolVhs.dropzone.loadSample}
				</button>
			</p>
		</div>
		<input
			bind:this={fileInputEl}
			type="file"
			accept="video/*"
			disabled={isBusy}
			onchange={onFileInputChange}
		/>
	</div>

	{#if livePreviewUrl}
		<div class="vhs-preview">
			<video
				bind:this={videoEl}
				src={livePreviewUrl}
				muted={previewMuted}
				loop
				autoplay
				playsinline
				onloadedmetadata={onLoadedMetadata}
				onplay={onVideoPlay}
				onpause={onVideoPause}
				ontimeupdate={onVideoTimeUpdate}
				onseeked={onVideoSeeked}
				style="display:none"
			></video>
			<canvas bind:this={canvasEl}></canvas>
			<span class="vhs-preview-badge">{t.toolVhs.preview.badge} · {styleLabel(style)}</span>

			<div class="vhs-player-bar">
				<button
					type="button"
					class="vhs-player-btn"
					onclick={togglePlay}
					aria-label={isPlaying ? t.toolVhs.preview.pauseLabel : t.toolVhs.preview.playLabel}
				>
					{#if isPlaying}
						<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
							<rect x="5" y="4" width="4.5" height="16" rx="1" />
							<rect x="14.5" y="4" width="4.5" height="16" rx="1" />
						</svg>
					{:else}
						<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
							<path d="M7 4.5v15l13-7.5z" />
						</svg>
					{/if}
				</button>
				<span class="vhs-time">{formatTime(currentTime)}</span>
				<input
					type="range"
					class="vhs-seek"
					min="0"
					max={duration || 0}
					step="0.01"
					value={currentTime}
					oninput={onSeekInput}
					aria-label={t.toolVhs.preview.seekLabel}
				/>
				<span class="vhs-time">{formatTime(duration)}</span>
				<button
					type="button"
					class="vhs-player-btn"
					onclick={() => (previewMuted = !previewMuted)}
					aria-label={previewMuted ? t.toolVhs.preview.unmuteLabel : t.toolVhs.preview.muteLabel}
				>
					{previewMuted ? '🔇' : '🔊'}
				</button>
			</div>
		</div>
		<p class="vhs-preview-note">{t.toolVhs.preview.note}</p>
	{/if}

	<div class="controls" class:show={file !== null}>
		<div class="field">
			<label for="vhsStyle">{t.toolVhs.style.label}</label>
			<div class="quality-choices" id="vhsStyle" role="group" aria-label={t.toolVhs.style.label}>
				{#each VHS_STYLES as option (option)}
					<button
						type="button"
						class="quality-choice"
						class:is-active={style === option}
						onclick={() => selectStyle(option)}
					>
						{styleLabel(option)}
					</button>
				{/each}
			</div>
			<p class="hint">{styleDescription(style)}</p>
		</div>
	</div>

	{#if status === 'processing'}
		<button class="squish-btn is-processing" onclick={cancelProcessing}>
			<span class="squish-btn-fill" style="width: {progress}%"></span>
			<span class="squish-btn-label">
				<span class="squish-btn-text">{progressLabel}</span>
				<span class="squish-btn-pct">{progress}% · {t.toolVhs.button.cancel}</span>
			</span>
		</button>
	{:else}
		<button class="squish-btn" disabled={!file} onclick={startProcessing}>
			<span class="squish-btn-idle">
				{t.toolVhs.button.idle}
				<svg class="squish-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<g transform="translate(0, -1.3)">
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
						<polyline points="7 10 12 15 17 10" />
						<line x1="12" y1="15" x2="12" y2="3" />
					</g>
				</svg>
			</span>
		</button>
	{/if}

	{#if status === 'error'}
		<p class="tool-error">{errorMessage}</p>
	{/if}

	<div class="result" class:show={status === 'done' && result !== null} bind:this={resultEl}>
		{#if result}
			<div class="stat">{styleLabel(result.style)}</div>
			<p class="result-summary">
				{fill(t.toolVhs.result.summary, {
					width: result.width,
					height: result.height,
					size: formatSize(result.newBytes)
				})}
			</p>

			<div class="result-actions">
				<a
					href={result.url}
					download={result.fileName}
					class="download-btn"
					onclick={() => track('download')}
				>
					{t.toolVhs.result.download}
				</a>
				<button type="button" class="compress-new-btn" onclick={processAnother}>
					{t.toolVhs.result.processNew}
				</button>
			</div>

			<SupportLink />
		{/if}
	</div>

	<div class="privacy-note"><span class="dot"></span>{t.toolVhs.privacyNote}</div>
</div>

<ShareRow title={shareTitle} />

<hr class="content-divider" />

<style>
	.vhs-preview {
		position: relative;
		margin-top: 16px;
		border-radius: var(--radius-md);
		overflow: hidden;
		background: #000;
		line-height: 0;
		display: flex;
		justify-content: center;
	}
	.vhs-preview canvas {
		display: block;
		width: auto;
		height: 430px;
		max-width: 100%;
	}
	@media (max-width: 640px) {
		.vhs-preview canvas {
			height: 320px;
		}
	}
	.vhs-preview-badge {
		position: absolute;
		top: 10px;
		left: 10px;
		padding: 10px;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.55);
		color: #fff;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.02em;
	}
	.vhs-player-bar {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		background: linear-gradient(0deg, rgba(0, 0, 0, 0.72), rgba(0, 0, 0, 0.28) 80%, transparent);
	}
	.vhs-player-btn {
		flex-shrink: 0;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		border: none;
		background: rgba(255, 255, 255, 0.15);
		color: #fff;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 13px;
		line-height: 1;
		padding: 0;
	}
	.vhs-player-btn:hover {
		background: rgba(255, 255, 255, 0.3);
	}
	.vhs-time {
		flex-shrink: 0;
		color: #fff;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		min-width: 28px;
		text-align: center;
	}
	.vhs-seek[type='range'] {
		flex: 1 1 auto;
		width: auto;
		height: 4px;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.3);
	}
	.vhs-seek[type='range']::-webkit-slider-thumb {
		width: 13px;
		height: 13px;
		border: none;
		background: #fff;
		box-shadow: none;
	}
	.vhs-seek[type='range']::-moz-range-thumb {
		width: 13px;
		height: 13px;
		border: none;
		background: #fff;
		box-shadow: none;
	}
	.vhs-preview-note {
		margin-top: 8px;
		font-size: 11.5px;
		color: var(--muted);
	}
	/* Override the shared .quality-choice sizing (global.css) just for this
	   tool's longer two-word labels: keep each label on one line, and size
	   buttons to their text instead of stretching to equal-width columns --
	   with flex-wrap already on .quality-choices, buttons wrap onto new
	   rows as whole units instead of text wrapping inside one. */
	.quality-choice {
		flex: 0 1 auto;
		min-width: 0;
		white-space: nowrap;
	}
</style>

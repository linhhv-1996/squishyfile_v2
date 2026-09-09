<script lang="ts">
	// The tool UI only. Every bit of decoding/extracting/zipping logic runs
	// inside frameextractor.worker.ts -- this component just reflects worker
	// messages into state and never does any processing itself.
	//
	// The scrub/trim mechanics below are lifted straight from
	// ConvertVideoToGif.svelte's trim timeline (zoom, filmstrip thumbnails,
	// draggable handles, typed time entry) so a returning user gets the same
	// feel: the "current frame" mode reuses it as a single scrub position (no
	// handles, just the playhead), and "time range" mode reuses it exactly as
	// GIF's trim bar does, with both handles active.
	import { onDestroy, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { getStrings } from '$lib/i18n';
	import ShareRow from '$lib/components/share/ShareRow.svelte';
	import SupportLink from '$lib/components/support/SupportLink.svelte';
	import {
		defaultFrameExtractOptions,
		planFrameTimestamps,
		MIN_INTERVAL_SEC,
		MAX_INTERVAL_SEC,
		MIN_FRAME_COUNT,
		MAX_FRAME_COUNT,
		MIN_JPEG_QUALITY,
		MAX_JPEG_QUALITY,
		type FrameExtractMode,
		type FrameExtractOptions
	} from '$lib/frameextractor/plan';
	import type { WorkerOutMessage, ExtractStage } from './frameextractor.worker';
	import { trackEvent, roundMb } from '$lib/analytics';

	let {
		shareTitle = '',
		samplePath = '/bun33s.mp4',
		sampleFileName = 'bun33s.mp4',
		sampleMimeType = 'video/mp4'
	}: {
		shareTitle?: string;
		samplePath?: string;
		sampleFileName?: string;
		sampleMimeType?: string;
	} = $props();

	const t = getStrings();

	const TOOL = 'frameextractor';
	function track(action: string, params: Record<string, string | number | boolean | undefined> = {}) {
		trackEvent(`tool_${TOOL}_${action}`, params);
	}
	// Set when a run starts so the success event can report how long it took.
	let extractStartedAt = 0;

	type Status = 'idle' | 'probing' | 'ready' | 'processing' | 'done' | 'error';

	let file = $state<File | null>(null);
	let isDragging = $state(false);
	let status = $state<Status>('idle');
	let progress = $state(0);
	let stage = $state<ExtractStage>('probing');
	let errorMessage = $state('');
	let fileInputEl = $state<HTMLInputElement>();
	let isSampleLoading = $state(false);
	let isSampleFile = $state(false);
	let resultEl = $state<HTMLDivElement>();

	let source = $state<{ durationSec: number; width: number; height: number } | null>(null);
	let options = $state<FrameExtractOptions | null>(null);

	let videoUrl = $state<string | null>(null);
	let videoEl = $state<HTMLVideoElement>();
	let trackEl = $state<HTMLDivElement>();
	let draggingHandle = $state<'start' | 'end' | null>(null);
	// Same zoom-the-view-window mechanism as ConvertVideoToGif.svelte -- see
	// its comment for why zoom exists (a short selection inside a long video
	// would otherwise put both handles a couple of pixels apart).
	let zoom = $state(1);
	let viewStartSec = $state(0);
	let isPreviewPlaying = $state(false);
	let currentTimeSec = $state(0);
	let isScrubbing = $state(false);
	let thumbnails = $state<string[]>([]);
	let thumbGeneration = 0;

	let result = $state<{
		url: string;
		fileName: string;
		isZip: boolean;
		frameCount: number;
		originalBytes: number;
		resultBytes: number;
		frames: { url: string; fileName: string }[];
	} | null>(null);

	let worker: Worker | undefined;

	// Created on first use, not on page load -- the worker bundles Mediabunny
	// (and, only when a legacy container needs it, ffmpeg.wasm), and most
	// visitors reading the page below never touch the tool.
	function getWorker(): Worker | undefined {
		if (!browser) return undefined;
		if (worker) return worker;

		worker = new Worker(new URL('./frameextractor.worker.ts', import.meta.url), {
			type: 'module'
		});
		worker.onerror = (event: ErrorEvent) => {
			console.error('[ExtractVideoFrames] worker crashed:', event.message, event);
			status = 'error';
			errorMessage = t.toolFrameExtractor.errors.generic;
			track('extract_error', { error_code: 'worker_crash' });
		};
		worker.onmessageerror = (event: MessageEvent) => {
			console.error('[ExtractVideoFrames] worker message could not be deserialized:', event);
		};
		worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
			const data = event.data;

			if (data.type === 'probed') {
				source = data.source;
				options = defaultFrameExtractOptions(data.source);
				status = 'ready';
				zoom = 1;
				viewStartSec = 0;
				if (videoUrl) void generateThumbnails(videoUrl, 0, data.source.durationSec);
				return;
			}

			if (data.type === 'progress') {
				progress = data.progress;
				stage = data.stage;
				return;
			}

			if (data.type === 'error') {
				console.error('[ExtractVideoFrames] worker reported an error:', data.message);
				status = 'error';
				errorMessage =
					data.code === 'no_video'
						? t.toolFrameExtractor.errors.noVideo
						: data.code === 'unsupported_container'
							? t.toolFrameExtractor.errors.unsupported
							: t.toolFrameExtractor.errors.generic;
				track('extract_error', { error_code: data.code ?? 'worker_error' });
				return;
			}

			// done
			progress = 100;
			revokeResult();
			result = {
				url: URL.createObjectURL(data.blob),
				fileName: data.fileName,
				isZip: data.isZip,
				frameCount: data.frameCount,
				originalBytes: data.originalBytes,
				resultBytes: data.resultBytes,
				frames: (data.frames ?? []).map((f) => ({ url: URL.createObjectURL(f.blob), fileName: f.fileName }))
			};
			status = 'done';
			track('extract_success', {
				duration_ms: Date.now() - extractStartedAt,
				original_size_mb: roundMb(data.originalBytes),
				result_size_mb: roundMb(data.resultBytes),
				frame_count: data.frameCount,
				is_zip: data.isZip
			});
			tick().then(() => resultEl?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
		};

		return worker;
	}

	function revokeResult() {
		if (result) {
			URL.revokeObjectURL(result.url);
			for (const frame of result.frames) URL.revokeObjectURL(frame.url);
		}
		result = null;
	}

	function revokeVideoUrl() {
		if (videoUrl) URL.revokeObjectURL(videoUrl);
		videoUrl = null;
	}

	onDestroy(() => {
		revokeResult();
		revokeVideoUrl();
		worker?.terminate();
	});

	function formatSize(bytes: number) {
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	}

	function formatTime(totalSeconds: number) {
		const s = Math.max(0, totalSeconds);
		const m = Math.floor(s / 60);
		const rem = (s % 60).toFixed(1);
		return `${m}:${rem.padStart(4, '0')}`;
	}

	function fill(template: string, values: Record<string, string | number>) {
		return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
	}

	function reset() {
		status = 'idle';
		progress = 0;
		errorMessage = '';
		source = null;
		options = null;
		isPreviewPlaying = false;
		currentTimeSec = 0;
		thumbnails = [];
		thumbGeneration += 1;
		revokeResult();
	}

	// --- Filmstrip thumbnails -- identical mechanism to ConvertVideoToGif.svelte ---
	const THUMBNAIL_COUNT = 12;

	function seekVideo(vid: HTMLVideoElement, timeSec: number): Promise<void> {
		return new Promise((resolve) => {
			const onSeeked = () => {
				vid.removeEventListener('seeked', onSeeked);
				resolve();
			};
			vid.addEventListener('seeked', onSeeked);
			vid.currentTime = timeSec;
		});
	}

	async function generateThumbnails(url: string, rangeStartSec: number, rangeEndSec: number) {
		if (!browser) return;
		const generation = thumbGeneration;
		const vid = document.createElement('video');
		vid.muted = true;
		vid.playsInline = true;
		vid.preload = 'auto';
		vid.src = url;

		await new Promise<void>((resolve, reject) => {
			vid.onloadeddata = () => resolve();
			vid.onerror = () => reject(new Error('thumbnail source failed to load'));
		}).catch(() => null);

		if (generation !== thumbGeneration) return;

		const canvas = document.createElement('canvas');
		canvas.width = 96;
		canvas.height = 96;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const span = Math.max(0.1, rangeEndSec - rangeStartSec);
		const frames: string[] = [];
		for (let i = 0; i < THUMBNAIL_COUNT; i++) {
			if (generation !== thumbGeneration) return;
			const time = Math.min(
				rangeEndSec - 0.02,
				Math.max(rangeStartSec, rangeStartSec + (i / THUMBNAIL_COUNT) * span)
			);
			try {
				await seekVideo(vid, time);
				const vw = vid.videoWidth || canvas.width;
				const vh = vid.videoHeight || canvas.height;
				const side = Math.min(vw, vh);
				ctx.drawImage(vid, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
				frames.push(canvas.toDataURL('image/jpeg', 0.6));
			} catch {
				// A single failed seek shouldn't kill the whole filmstrip.
			}
		}

		if (generation === thumbGeneration) thumbnails = frames;
	}

	function handleFile(next: File | null | undefined, method: 'browse' | 'drop' | 'sample' = 'browse') {
		if (!next) return;
		isSampleFile = method === 'sample';
		file = next;
		reset();
		revokeVideoUrl();
		videoUrl = URL.createObjectURL(next);
		status = 'probing';
		track('file_added', { method, file_size_mb: roundMb(next.size) });

		const activeWorker = getWorker();
		activeWorker?.postMessage({ type: 'probe', file: next });
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

	const isBusy = $derived(status === 'processing' || status === 'probing' || isSampleLoading);

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

	function removeFile() {
		if (isBusy) return;
		if (fileInputEl) fileInputEl.value = '';
		file = null;
		reset();
		revokeVideoUrl();
		track('file_removed');
	}

	function extractAnother() {
		if (fileInputEl) fileInputEl.value = '';
		file = null;
		reset();
		revokeVideoUrl();
		track('reset');
	}

	async function loadSample() {
		if (isBusy) return;
		isSampleLoading = true;
		try {
			const response = await fetch(samplePath);
			if (!response.ok) throw new Error('sample fetch failed');
			const blob = await response.blob();
			handleFile(new File([blob], sampleFileName, { type: sampleMimeType }), 'sample');
		} catch {
			status = 'error';
			errorMessage = t.toolFrameExtractor.errors.generic;
			track('extract_error', { error_code: 'sample_fetch_failed' });
		} finally {
			isSampleLoading = false;
		}
	}

	function startExtraction() {
		const activeWorker = getWorker();
		if (!file || !options || !activeWorker) return;
		revokeResult();
		status = 'processing';
		stage = 'probing';
		progress = 0;
		extractStartedAt = Date.now();
		track('extract_start', {
			mode: options.mode,
			format: options.format,
			frame_count_estimate: estimatedFrameCount
		});
		activeWorker.postMessage({ type: 'extract', file, options: { ...options } });
	}

	function cancelExtraction() {
		track('extract_cancel');
		worker?.postMessage({ type: 'cancel' });
		status = 'ready';
		progress = 0;
	}

	// --- Scrub / trim timeline -- same pixel<->second mapping as ConvertVideoToGif.svelte ---
	const MAX_ZOOM = 60;
	const MIN_VIEW_WINDOW_SEC = 1;

	const viewWindowSec = $derived(source ? Math.max(MIN_VIEW_WINDOW_SEC, source.durationSec / zoom) : 0);
	const viewEndSec = $derived(source ? Math.min(source.durationSec, viewStartSec + viewWindowSec) : 0);

	function clampViewStart(sec: number): number {
		if (!source) return 0;
		return Math.min(Math.max(0, sec), Math.max(0, source.durationSec - viewWindowSec));
	}

	function secToViewPercent(sec: number): number {
		if (!source || viewWindowSec <= 0) return 0;
		return ((sec - viewStartSec) / viewWindowSec) * 100;
	}

	function viewPercentToSec(percent: number): number {
		return viewStartSec + Math.min(1, Math.max(0, percent / 100)) * viewWindowSec;
	}

	let thumbRefreshTimer: ReturnType<typeof setTimeout> | undefined;
	function scheduleThumbRefresh() {
		if (!videoUrl || !source) return;
		clearTimeout(thumbRefreshTimer);
		thumbRefreshTimer = setTimeout(() => {
			if (videoUrl) void generateThumbnails(videoUrl, viewStartSec, viewEndSec);
		}, 150);
	}

	function setZoom(next: number, anchorSec?: number) {
		if (!source) return;
		const anchor = anchorSec ?? viewStartSec + viewWindowSec / 2;
		zoom = Math.min(MAX_ZOOM, Math.max(1, next));
		const nextWindow = Math.max(MIN_VIEW_WINDOW_SEC, source.durationSec / zoom);
		viewStartSec = clampViewStart(anchor - nextWindow / 2);
		scheduleThumbRefresh();
	}

	function zoomIn() {
		setZoom(zoom * 1.8);
	}

	function zoomOut() {
		setZoom(zoom / 1.8);
	}

	function resetZoom() {
		if (!source) return;
		zoom = 1;
		viewStartSec = 0;
		scheduleThumbRefresh();
	}

	function onTimelineWheel(event: WheelEvent) {
		if (!source || !trackEl) return;
		event.preventDefault();
		if (event.ctrlKey || event.metaKey) {
			const rect = trackEl.getBoundingClientRect();
			const percent = ((event.clientX - rect.left) / rect.width) * 100;
			setZoom(zoom * Math.exp(-event.deltaY * 0.01), viewPercentToSec(percent));
			return;
		}
		const delta = event.deltaX !== 0 ? event.deltaX : event.deltaY;
		viewStartSec = clampViewStart(viewStartSec + (delta / (trackEl.clientWidth || 1)) * viewWindowSec);
		scheduleThumbRefresh();
	}

	// Only 'range' mode has draggable start/end handles -- the other three
	// modes apply to a single point or the whole clip, so the timeline in
	// those modes is scrub-only (see onScrubPointerDown below).
	function updateHandleFromClientX(which: 'start' | 'end', clientX: number) {
		if (!trackEl || !source || !options || options.mode !== 'range') return;
		const rect = trackEl.getBoundingClientRect();
		const percent = ((clientX - rect.left) / rect.width) * 100;
		const sec = viewPercentToSec(percent);
		const minGap = Math.min(0.1, source.durationSec / 10);

		if (which === 'start') {
			options.rangeStartSec = Math.min(Math.max(0, sec), options.rangeEndSec - minGap);
		} else {
			options.rangeEndSec = Math.max(Math.min(source.durationSec, sec), options.rangeStartSec + minGap);
		}

		if (videoEl) videoEl.currentTime = which === 'start' ? options.rangeStartSec : options.rangeEndSec;
	}

	function releaseCapture(event: PointerEvent) {
		const target = event.target as Element | null;
		if (target?.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId);
	}

	function onHandlePointerDown(which: 'start' | 'end', event: PointerEvent) {
		if (isBusy) return;
		draggingHandle = which;
		(event.target as Element).setPointerCapture(event.pointerId);
		updateHandleFromClientX(which, event.clientX);
	}

	function onHandlePointerMove(event: PointerEvent) {
		if (!draggingHandle) return;
		updateHandleFromClientX(draggingHandle, event.clientX);
	}

	function onHandlePointerUp(event: PointerEvent) {
		if (!draggingHandle) return;
		draggingHandle = null;
		releaseCapture(event);
	}

	function onHandleKeydown(which: 'start' | 'end', event: KeyboardEvent) {
		if (isBusy || !source || !options || options.mode !== 'range') return;
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
		event.preventDefault();
		const step = event.shiftKey ? 1 : 1 / 30;
		const delta = event.key === 'ArrowLeft' ? -step : step;
		const minGap = Math.min(0.1, source.durationSec / 10);
		if (which === 'start') {
			options.rangeStartSec = Math.min(Math.max(0, options.rangeStartSec + delta), options.rangeEndSec - minGap);
			if (videoEl) videoEl.currentTime = options.rangeStartSec;
		} else {
			options.rangeEndSec = Math.max(
				Math.min(source.durationSec, options.rangeEndSec + delta),
				options.rangeStartSec + minGap
			);
			if (videoEl) videoEl.currentTime = options.rangeEndSec;
		}
	}

	// Scrubbing the bar always moves the preview; in 'current' mode it also
	// sets the exact timestamp that will be extracted.
	function scrubToClientX(clientX: number) {
		if (!trackEl || !source || !videoEl) return;
		const rect = trackEl.getBoundingClientRect();
		const percent = ((clientX - rect.left) / rect.width) * 100;
		const sec = viewPercentToSec(percent);
		videoEl.currentTime = sec;
		currentTimeSec = sec;
		if (options && options.mode === 'current') options.currentSec = sec;
	}

	function onScrubPointerDown(event: PointerEvent) {
		if (isBusy || !trackEl) return;
		if ((event.target as HTMLElement).closest('.trim-handle')) return;
		isScrubbing = true;
		videoEl?.pause();
		(event.target as Element).setPointerCapture(event.pointerId);
		scrubToClientX(event.clientX);
	}

	function onScrubPointerMove(event: PointerEvent) {
		if (!isScrubbing) return;
		scrubToClientX(event.clientX);
	}

	function onScrubPointerUp(event: PointerEvent) {
		if (!isScrubbing) return;
		isScrubbing = false;
		releaseCapture(event);
	}

	function togglePreviewPlay() {
		if (!videoEl) return;
		if (isPreviewPlaying) {
			videoEl.pause();
			return;
		}
		videoEl.play();
	}

	function onPreviewTimeUpdate() {
		if (!videoEl) return;
		currentTimeSec = videoEl.currentTime;
	}

	function parseTimeInput(value: string, durationSec: number): number | null {
		const trimmed = value.trim();
		if (!trimmed) return null;
		if (/^\d+(\.\d+)?$/.test(trimmed)) {
			const sec = Number(trimmed);
			return Number.isFinite(sec) ? Math.min(Math.max(0, sec), durationSec) : null;
		}
		const match = trimmed.match(/^(\d+):([0-5]?\d(?:\.\d+)?)$/);
		if (!match) return null;
		const sec = Number(match[1]) * 60 + Number(match[2]);
		return Number.isFinite(sec) ? Math.min(Math.max(0, sec), durationSec) : null;
	}

	function onCurrentTimeInput(event: Event) {
		if (!source || !options) return;
		const sec = parseTimeInput((event.currentTarget as HTMLInputElement).value, source.durationSec);
		if (sec === null) return;
		options.currentSec = sec;
		if (videoEl) videoEl.currentTime = sec;
		currentTimeSec = sec;
	}

	function onRangeStartInput(event: Event) {
		if (!source || !options) return;
		const sec = parseTimeInput((event.currentTarget as HTMLInputElement).value, source.durationSec);
		if (sec === null) return;
		const minGap = Math.min(0.1, source.durationSec / 10);
		options.rangeStartSec = Math.min(sec, options.rangeEndSec - minGap);
		if (videoEl) videoEl.currentTime = options.rangeStartSec;
	}

	function onRangeEndInput(event: Event) {
		if (!source || !options) return;
		const sec = parseTimeInput((event.currentTarget as HTMLInputElement).value, source.durationSec);
		if (sec === null) return;
		const minGap = Math.min(0.1, source.durationSec / 10);
		options.rangeEndSec = Math.max(sec, options.rangeStartSec + minGap);
		if (videoEl) videoEl.currentTime = options.rangeEndSec;
	}

	// Changing mode re-seeds the preview to something sensible for that mode
	// so the scrubber/handles land somewhere meaningful right away instead
	// of wherever the playhead happened to be.
	function onModeChange(nextMode: FrameExtractMode) {
		if (!options || !source) return;
		options.mode = nextMode;
		if (nextMode === 'current' && videoEl) {
			videoEl.currentTime = options.currentSec;
		} else if (nextMode === 'range' && videoEl) {
			videoEl.currentTime = options.rangeStartSec;
		}
	}

	const startPercent = $derived(
		source && options && options.mode === 'range' ? Math.min(100, Math.max(0, secToViewPercent(options.rangeStartSec))) : 0
	);
	const endPercent = $derived(
		source && options && options.mode === 'range' ? Math.min(100, Math.max(0, secToViewPercent(options.rangeEndSec))) : 100
	);
	const playheadPercent = $derived(source ? Math.min(100, Math.max(0, secToViewPercent(currentTimeSec))) : 0);

	const estimatedFrameCount = $derived(source && options ? planFrameTimestamps(source, options).length : 0);

	const progressLabel = $derived.by(() => {
		if (status === 'done') return t.toolFrameExtractor.progress.done;
		if (stage === 'probing') return t.toolFrameExtractor.progress.probing;
		if (stage === 'loading-engine') return t.toolFrameExtractor.progress.loadingEngine;
		if (stage === 'decoding') return t.toolFrameExtractor.progress.decoding;
		if (stage === 'packaging') return t.toolFrameExtractor.progress.packaging;
		return t.toolFrameExtractor.progress.encoding;
	});
</script>

<svelte:window
	onpointermove={(e) => {
		onHandlePointerMove(e);
		onScrubPointerMove(e);
	}}
	onpointerup={(e) => {
		onHandlePointerUp(e);
		onScrubPointerUp(e);
	}}
	onpointercancel={(e) => {
		onHandlePointerUp(e);
		onScrubPointerUp(e);
	}}
/>

<div class="tool-card">
	<div
		class="dropzone"
		class:is-drag={isDragging}
		class:is-locked={isBusy}
		role="button"
		aria-disabled={isBusy}
		tabindex={isBusy ? -1 : 0}
		onclick={onDropzoneClick}
		onkeydown={onDropzoneKeydown}
		ondrop={onDrop}
		ondragover={onDragOver}
		ondragleave={onDragLeave}
	>
		{#if isSampleLoading || status === 'probing'}
			<div class="dz-overlay">
				<span class="dz-spinner" aria-hidden="true"></span>
			</div>
		{/if}
		<span class="icon">
			<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<rect x="3" y="5" width="18" height="14" rx="2" />
				<circle cx="9" cy="12" r="2.5" />
				<path d="M14 9l4 3-4 3z" />
			</svg>
		</span>
		<div class="dz-text">
			<p class="dz-title">
				{t.toolFrameExtractor.dropzone.titlePrefix}
				<button type="button" disabled={isBusy} onclick={() => fileInputEl?.click()}>
					{t.toolFrameExtractor.dropzone.browse}
				</button>
			</p>
			<p class="dz-sub">
				{t.toolFrameExtractor.dropzone.subtitle}
				<button type="button" class="dz-sample" disabled={isBusy} onclick={loadSample}>
					{t.toolFrameExtractor.dropzone.loadSample}
				</button>
			</p>
		</div>
		<input
			bind:this={fileInputEl}
			type="file"
			accept="video/mp4,video/quicktime,video/webm,video/*"
			disabled={isBusy}
			onchange={onFileInputChange}
		/>
	</div>

	<div class="file-info" class:show={file !== null}>
		<span class="fname">{file?.name ?? ''}</span>
		<span class="fsize">{file ? formatSize(file.size) : ''}</span>
		<button class="remove" title={t.toolFrameExtractor.fileInfo.remove} disabled={isBusy} onclick={removeFile}>
			✕
		</button>
	</div>

	<div class="controls" class:show={file !== null && source !== null && options !== null}>
		{#if source && options}
			<div class="field">
				<div class="trim-preview-wrap">
					<!-- svelte-ignore a11y_media_has_caption -- muted scrub preview, no dialogue to caption -->
					<video
						bind:this={videoEl}
						src={videoUrl}
						class="trim-preview"
						muted
						playsinline
						preload="metadata"
						ontimeupdate={onPreviewTimeUpdate}
						onplay={() => (isPreviewPlaying = true)}
						onpause={() => (isPreviewPlaying = false)}
					></video>
					<button
						type="button"
						class="preview-play-btn"
						aria-label={isPreviewPlaying ? t.toolFrameExtractor.trim.pause : t.toolFrameExtractor.trim.play}
						onclick={togglePreviewPlay}
					>
						{#if isPreviewPlaying}
							<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
						{:else}
							<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
						{/if}
					</button>
				</div>
				<div class="trim-zoom-row">
					<button
						type="button"
						class="zoom-btn"
						disabled={isBusy || zoom <= 1}
						aria-label={t.toolFrameExtractor.trim.zoomOut}
						onclick={zoomOut}
					>
						−
					</button>
					<span class="zoom-level">{zoom.toFixed(1)}×</span>
					<button
						type="button"
						class="zoom-btn"
						disabled={isBusy || zoom >= MAX_ZOOM}
						aria-label={t.toolFrameExtractor.trim.zoomIn}
						onclick={zoomIn}
					>
						+
					</button>
					{#if zoom > 1}
						<button type="button" class="zoom-link" disabled={isBusy} onclick={resetZoom}>
							{t.toolFrameExtractor.trim.zoomReset}
						</button>
					{/if}
				</div>
				<div
					class="trim-timeline"
					id="fx-scrub"
					bind:this={trackEl}
					onpointerdown={onScrubPointerDown}
					onwheel={onTimelineWheel}
					role="presentation"
				>
					<div class="trim-thumbs" aria-hidden="true">
						{#each thumbnails as thumb, i (i)}
							<div class="trim-thumb" style="background-image:url({thumb})"></div>
						{/each}
					</div>
					{#if options.mode === 'range'}
						<div class="trim-mask trim-mask-left" style="width:{startPercent}%"></div>
						<div class="trim-mask trim-mask-right" style="width:{100 - endPercent}%"></div>
					{/if}
					<div class="trim-playhead" style="left:{playheadPercent}%" aria-hidden="true"></div>
					{#if options.mode === 'range'}
						<div
							class="trim-handle trim-handle-start"
							style="left:{startPercent}%"
							role="slider"
							tabindex="0"
							aria-label={t.toolFrameExtractor.trim.start}
							aria-valuemin={0}
							aria-valuemax={options.rangeEndSec}
							aria-valuenow={options.rangeStartSec}
							onpointerdown={(e) => onHandlePointerDown('start', e)}
							onkeydown={(e) => onHandleKeydown('start', e)}
						></div>
						<div
							class="trim-handle trim-handle-end"
							style="left:{endPercent}%"
							role="slider"
							tabindex="0"
							aria-label={t.toolFrameExtractor.trim.end}
							aria-valuemin={options.rangeStartSec}
							aria-valuemax={source.durationSec}
							aria-valuenow={options.rangeEndSec}
							onpointerdown={(e) => onHandlePointerDown('end', e)}
							onkeydown={(e) => onHandleKeydown('end', e)}
						></div>
					{/if}
				</div>
				{#if options.mode === 'interval' || options.mode === 'count'}
					<p class="hint" style="margin-bottom:0;">
						{fill(t.toolFrameExtractor.trim.playheadHint, { time: formatTime(currentTimeSec) })}
					</p>
				{/if}
			</div>

			<div class="settings-list">
				<div class="setting-row">
					<span class="setting-label" id="fx-mode-label">{t.toolFrameExtractor.mode.label}</span>
					<select
						class="setting-select"
						aria-labelledby="fx-mode-label"
						disabled={isBusy}
						value={options.mode}
						onchange={(e) => onModeChange((e.currentTarget as HTMLSelectElement).value as FrameExtractMode)}
					>
						<option value="current">{t.toolFrameExtractor.mode.options.current}</option>
						<option value="interval">{t.toolFrameExtractor.mode.options.interval}</option>
						<option value="range">{t.toolFrameExtractor.mode.options.range}</option>
						<option value="count">{t.toolFrameExtractor.mode.options.count}</option>
					</select>
				</div>

				{#if options.mode === 'range'}
					<div class="setting-row">
						<label class="setting-label" for="fx-range-start">{t.toolFrameExtractor.trim.start}</label>
						<input
							type="text"
							id="fx-range-start"
							class="setting-time-input"
							inputmode="decimal"
							disabled={isBusy}
							value={formatTime(options.rangeStartSec)}
							onchange={onRangeStartInput}
						/>
					</div>
					<div class="setting-row">
						<label class="setting-label" for="fx-range-end">{t.toolFrameExtractor.trim.end}</label>
						<input
							type="text"
							id="fx-range-end"
							class="setting-time-input"
							inputmode="decimal"
							disabled={isBusy}
							value={formatTime(options.rangeEndSec)}
							onchange={onRangeEndInput}
						/>
					</div>
				{/if}

				{#if options.mode === 'interval'}
					<div class="setting-row setting-row-slider">
						<label class="setting-label" for="fx-interval">{t.toolFrameExtractor.interval.label}</label>
						<div class="slider-control">
							<input
								type="number"
								class="setting-number"
								aria-label={t.toolFrameExtractor.interval.label}
								min={MIN_INTERVAL_SEC}
								max={MAX_INTERVAL_SEC}
								step="0.5"
								disabled={isBusy}
								bind:value={options.intervalSec}
							/>
							<!-- <input
								type="range"
								id="fx-interval"
								min={MIN_INTERVAL_SEC}
								max={MAX_INTERVAL_SEC}
								step="0.5"
								disabled={isBusy}
								bind:value={options.intervalSec}
							/> -->
						</div>
					</div>
				{/if}

				{#if options.mode === 'range'}
					<div class="setting-row setting-row-slider">
						<label class="setting-label" for="fx-range-interval">{t.toolFrameExtractor.rangeInterval.label}</label>
						<div class="slider-control">
							<input
								type="number"
								class="setting-number"
								aria-label={t.toolFrameExtractor.rangeInterval.label}
								min={MIN_INTERVAL_SEC}
								max={MAX_INTERVAL_SEC}
								step="0.5"
								disabled={isBusy}
								bind:value={options.rangeIntervalSec}
							/>
							<!-- <input
								type="range"
								id="fx-range-interval"
								min={MIN_INTERVAL_SEC}
								max={MAX_INTERVAL_SEC}
								step="0.5"
								disabled={isBusy}
								bind:value={options.rangeIntervalSec}
							/> -->
						</div>
					</div>
				{/if}

				{#if options.mode === 'count'}
					<div class="setting-row setting-row-slider">
						<label class="setting-label" for="fx-count">{t.toolFrameExtractor.count.label}</label>
						<div class="slider-control">
							<input
								type="number"
								class="setting-number"
								aria-label={t.toolFrameExtractor.count.label}
								min={MIN_FRAME_COUNT}
								max={MAX_FRAME_COUNT}
								step="1"
								disabled={isBusy}
								bind:value={options.count}
							/>
							<!-- <input
								type="range"
								id="fx-count"
								min={MIN_FRAME_COUNT}
								max={MAX_FRAME_COUNT}
								step="1"
								disabled={isBusy}
								bind:value={options.count}
							/> -->
						</div>
					</div>
				{/if}

				<div class="setting-row">
					<span class="setting-label" id="fx-format-label">{t.toolFrameExtractor.format.label}</span>
					<select
						class="setting-select"
						aria-labelledby="fx-format-label"
						disabled={isBusy}
						bind:value={options.format}
					>
						<option value="png">{t.toolFrameExtractor.format.png}</option>
						<option value="jpeg">{t.toolFrameExtractor.format.jpeg}</option>
					</select>
				</div>

				{#if options.format === 'jpeg'}
					<div class="setting-row setting-row-slider">
						<label class="setting-label" for="fx-jpeg-quality">{t.toolFrameExtractor.jpegQuality.label}</label>
						<div class="slider-control">
							<!-- <input
								type="number"
								class="setting-number"
								aria-label={t.toolFrameExtractor.jpegQuality.label}
								min={MIN_JPEG_QUALITY}
								max={MAX_JPEG_QUALITY}
								step="1"
								disabled={isBusy}
								bind:value={options.jpegQuality}
							/> -->
							<input
								type="range"
								id="fx-jpeg-quality"
								min={MIN_JPEG_QUALITY}
								max={MAX_JPEG_QUALITY}
								step="1"
								disabled={isBusy}
								bind:value={options.jpegQuality}
							/>
						</div>
					</div>
				{/if}
			</div>

			<p class="estimate-note">
				{estimatedFrameCount === 1
					? t.toolFrameExtractor.estimate.singleFrame
					: fill(t.toolFrameExtractor.estimate.multiFrame, { count: estimatedFrameCount })}
			</p>
		{/if}
	</div>

	{#if status === 'processing'}
		<button class="squish-btn is-processing" onclick={cancelExtraction}>
			<span class="squish-btn-fill" style="width: {progress}%"></span>
			<span class="squish-btn-label">
				<span class="squish-btn-text">{progressLabel}</span>
				<span class="squish-btn-pct">{progress}% · {t.toolFrameExtractor.button.cancel}</span>
			</span>
		</button>
	{:else}
		<button class="squish-btn" disabled={!file || !options || isBusy} onclick={startExtraction}>
			{t.toolFrameExtractor.button.idle}
		</button>
	{/if}

	{#if status === 'error'}
		<p class="tool-error">{errorMessage}</p>
	{/if}

	<div class="result" class:show={status === 'done' && result !== null} bind:this={resultEl}>
		{#if result}
			{#if !result.isZip}
				<div class="frame-preview-frame">
					<img src={result.url} alt={t.toolFrameExtractor.result.statLabel} class="frame-preview-img" />
				</div>
			{/if}
			<div class="stat">{formatSize(result.resultBytes)}</div>
			<div class="stat-label">
				{result.isZip
					? fill(t.toolFrameExtractor.result.zipStatLabel, { count: result.frameCount })
					: t.toolFrameExtractor.result.statLabel}
			</div>
			<p class="result-summary">
				{result.isZip
					? fill(t.toolFrameExtractor.result.zipSummary, { count: result.frameCount })
					: t.toolFrameExtractor.result.summary}
			</p>

			{#if result.isZip && result.frames.length > 0}
				<div class="frame-gallery">
					{#each result.frames as frame (frame.url)}
						<div class="frame-gallery-item">
							<img src={frame.url} alt="" loading="lazy" />
							<a
								href={frame.url}
								download={frame.fileName}
								class="frame-dl-btn"
								title={frame.fileName}
								aria-label="Download {frame.fileName}"
								onclick={() => track('download_single')}
							>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<path d="M12 3v12" />
									<path d="m7 10 5 5 5-5" />
									<path d="M4 21h16" />
								</svg>
							</a>
						</div>
					{/each}
				</div>
			{/if}

			<div class="result-actions">
				<a href={result.url} download={result.fileName} class="download-btn" onclick={() => track('download')}>
					{result.isZip ? t.toolFrameExtractor.result.downloadZip : t.toolFrameExtractor.result.download}
				</a>
				<button type="button" class="compress-new-btn" onclick={extractAnother}>
					{t.toolFrameExtractor.result.extractNew}
				</button>
			</div>

			<SupportLink />
		{/if}
	</div>

	<div class="privacy-note"><span class="dot"></span>{t.toolFrameExtractor.privacyNote}</div>
</div>

<ShareRow title={shareTitle} />

<hr class="content-divider" />

<style>
	.result-summary {
		margin: 0 0 10px 0;
	}

	/* --- Scrub/trim preview: same treatment as ConvertVideoToGif.svelte's -- */
	.trim-preview-wrap {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		margin: 0 auto 10px;
		border-radius: var(--radius-sm);
		overflow: hidden;
		background: #000;
	}

	.trim-preview {
		display: block;
		max-width: 100%;
		max-height: 400px;
		width: auto;
		height: auto;
		background: #000;
	}

	@media (max-width: 480px) {
		.trim-preview {
			max-height: 160px;
		}
	}

	.preview-play-btn {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		border: none;
		background: rgba(0, 0, 0, 0.55);
		color: #fff;
		cursor: pointer;
		transition: background 0.15s ease, transform 0.1s ease;
	}

	.preview-play-btn:hover {
		background: rgba(0, 0, 0, 0.75);
	}

	.preview-play-btn:active {
		transform: translate(-50%, -50%) scale(0.94);
	}

	.preview-play-btn svg {
		width: 22px;
		height: 22px;
	}

	.trim-timeline {
		position: relative;
		height: 52px;
		border-radius: var(--radius-sm);
		overflow: hidden;
		cursor: pointer;
		touch-action: none;
		background: var(--teal-light);
	}

	.trim-thumbs {
		position: absolute;
		inset: 0;
		display: flex;
	}

	.trim-thumb {
		flex: 1 1 0;
		height: 100%;
		background-size: cover;
		background-position: center;
		background-repeat: no-repeat;
	}

	.trim-mask {
		position: absolute;
		top: 0;
		bottom: 0;
		background: rgba(20, 30, 26, 0.55);
		pointer-events: none;
	}

	.trim-mask-left {
		left: 0;
	}

	.trim-mask-right {
		right: 0;
	}

	.trim-playhead {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		margin-left: -1px;
		background: #fff;
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
		pointer-events: none;
		z-index: 2;
	}

	.trim-handle {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 16px;
		margin-left: -8px;
		background: var(--coral);
		cursor: grab;
		touch-action: none;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.trim-handle::before {
		content: '';
		width: 2px;
		height: 16px;
		border-radius: 1px;
		background: rgba(255, 255, 255, 0.85);
		box-shadow: 5px 0 0 rgba(255, 255, 255, 0.85);
	}

	.trim-handle-start {
		border-radius: 8px 2px 2px 8px;
	}

	.trim-handle-end {
		border-radius: 2px 8px 8px 2px;
	}

	.trim-handle:active {
		cursor: grabbing;
		background: var(--coral-dark);
	}

	.trim-zoom-row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 8px;
	}

	.zoom-btn {
		width: 26px;
		height: 26px;
		border-radius: var(--radius-sm);
		border: 1.5px solid var(--line);
		background: transparent;
		font-size: 16px;
		line-height: 1;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.zoom-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.zoom-level {
		font-size: 12px;
		color: var(--muted, #6b7a73);
		min-width: 34px;
		text-align: center;
	}

	.zoom-link {
		border: none;
		background: none;
		padding: 0 4px;
		font-size: 12px;
		color: var(--teal-dark, #1f6f5c);
		text-decoration: underline;
		cursor: pointer;
		margin-left: auto;
	}

	.zoom-link:disabled {
		opacity: 0.5;
		cursor: default;
	}


	/* --- Settings list: one row per setting, label left / control right --- */
	.settings-list {
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		padding: 0 14px;
	}

	.setting-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 11px 0;
		border-bottom: 1px solid var(--line);
	}

	.setting-row:last-child {
		border-bottom: none;
	}

	.setting-label {
		font-size: 13px;
		font-weight: 600;
		color: var(--ink);
	}

	.setting-select {
		flex-shrink: 0;
		min-width: 150px;
		padding: 7px 30px 7px 12px;
		border-radius: var(--radius-sm);
		border: 1.5px solid var(--line);
		background-color: #fff;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234A5750' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 10px center;
		background-size: 13px;
		font-family: inherit;
		font-size: 13px;
		font-weight: 600;
		color: var(--ink);
		cursor: pointer;
		appearance: none;
		-webkit-appearance: none;
		transition: border-color 0.15s ease;
	}

	.setting-select:hover {
		border-color: var(--teal);
	}

	.setting-select:focus {
		outline: none;
		border-color: var(--coral);
	}

	.setting-select:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}


	/* Same frame treatment as the trim preview above -- a black letterbox
	   box, height capped rather than width -- so a single extracted frame
	   much smaller than the card still sits centered instead of floating
	   lopsided. */
	.frame-preview-frame {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		margin-bottom: 12px;
		border-radius: var(--radius-sm);
		overflow: hidden;
		background: #000;
	}

	.frame-preview-img {
		display: block;
		max-width: 100%;
		max-height: 400px;
		width: auto;
		height: auto;
		object-fit: contain;
	}

	.result .stat {
		margin-top: 12px;
	}

	.result .stat-label {
		margin-top: 4px;
	}

	@media (max-width: 480px) {
		.frame-preview-img {
			max-height: 160px;
		}
	}
	.setting-row-slider {
		gap: 20px;
	}

	.setting-row-slider .setting-label {
		flex: 0 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.slider-control {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1 1 auto;
		min-width: 120px;
		justify-content: flex-end;
	}

	.setting-number {
		flex: 0 0 120px;
		/* width: 56px; */
		padding: 5px 6px;
		border-radius: var(--radius-sm);
		border: 1.5px solid var(--line);
		background: transparent;
		font: inherit;
		font-variant-numeric: tabular-nums;
		text-align: center;
		color: inherit;
	}

	.setting-number:disabled {
		opacity: 0.5;
	}

	.slider-control input[type='range'] {
		flex: 1 1 auto;
		min-width: 60px;
	}

	.setting-time-input {
		flex-shrink: 0;
		width: 90px;
		padding: 6px 8px;
		border-radius: var(--radius-sm);
		border: 1.5px solid var(--line);
		background: transparent;
		font: inherit;
		font-variant-numeric: tabular-nums;
		text-align: center;
		color: inherit;
	}

	.setting-time-input:disabled {
		opacity: 0.5;
	}

	.estimate-note {
		margin-top: 2px;
		padding: 8px 12px;
		border-radius: var(--radius-sm);
		background: var(--teal-light);
		color: var(--ink);
		font-size: 12.5px;
		text-align: center;
	}

	.frame-gallery {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 8px;
		margin-bottom: 12px;
	}

	.frame-gallery-item {
		position: relative;
		border-radius: var(--radius-sm);
		overflow: hidden;
		background: #000;
		aspect-ratio: 16 / 9;
	}

	.frame-gallery-item img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.frame-dl-btn {
		position: absolute;
		right: 8px;
		bottom: 8px;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.55);
		color: #fff;
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		opacity: 0;
		transition:
			opacity 0.15s ease,
			background 0.15s ease,
			transform 0.1s ease;
	}

	.frame-dl-btn svg {
		width: 16px;
		height: 16px;
	}

	.frame-gallery-item:hover .frame-dl-btn,
	.frame-gallery-item:focus-within .frame-dl-btn {
		opacity: 1;
	}

	.frame-dl-btn:hover {
		background: rgba(0, 0, 0, 0.78);
	}

	.frame-dl-btn:active {
		transform: scale(0.94);
	}

	@media (hover: none) {
		.frame-dl-btn {
			opacity: 1;
		}
	}

	@media (max-width: 480px) {
		.frame-gallery {
			grid-template-columns: 1fr;
		}

		.settings-list {
			padding: 0 10px;
		}

		.setting-row {
			flex-direction: column;
			align-items: flex-start;
			gap: 6px;
			padding: 10px 0;
		}

		.setting-row-slider {
			gap: 4px;
		}

		.setting-row-slider .setting-label {
			font-size: 12px;
		}

		.slider-control {
			min-width: 0;
			width: 100%;
		}

		.setting-select {
			min-width: 0;
			width: 100%;
		}

		.setting-time-input {
			width: 100%;
		}

		.setting-number {
			flex: 1 1 auto;
			min-width: 0;
			width: 100%;
		}
	}
</style>

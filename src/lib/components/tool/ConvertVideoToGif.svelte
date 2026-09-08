<script lang="ts">
	// The tool UI only. Every bit of decoding/quantizing/encoding logic runs
	// inside video2gif.worker.ts -- this component just reflects worker
	// messages into state and never does any processing itself. Structural
	// sibling of ConvertVideoToMp3.svelte, with an extra "probe" round trip
	// added before conversion: this tool needs the source's duration and
	// dimensions up front to size the trim timeline and seed sensible
	// defaults (video2mp3 never needed that -- it has no such controls).
	import { onDestroy, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { getStrings } from '$lib/i18n';
	import ShareRow from '$lib/components/share/ShareRow.svelte';
	import SupportLink from '$lib/components/support/SupportLink.svelte';
	import {
		availableGifResolutions,
		defaultGifOptions,
		estimateGifSizeBytes,
		GIF_COLOR_OPTIONS,
		GIF_CROP_PRESETS,
		GIF_FPS_OPTIONS,
		GIF_SPEED_OPTIONS,
		type GifOptions
	} from '$lib/video2gif/plan';
	import type { WorkerOutMessage } from './video2gif.worker';
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

	const TOOL = 'gif';
	function track(action: string, params: Record<string, string | number | boolean | undefined> = {}) {
		trackEvent(`tool_${TOOL}_${action}`, params);
	}
	// Set when a run starts so the success event can report how long it took.
	let convertStartedAt = 0;

	type Status = 'idle' | 'probing' | 'ready' | 'processing' | 'done' | 'error';
	type Stage = 'decoding' | 'quantizing' | 'encoding';

	let file = $state<File | null>(null);
	let isDragging = $state(false);
	let status = $state<Status>('idle');
	let progress = $state(0);
	let stage = $state<Stage>('decoding');
	let errorMessage = $state('');
	let fileInputEl = $state<HTMLInputElement>();
	let isSampleLoading = $state(false);
	// True while the file currently probing/loaded came from "try a sample",
	// so the probed handler below can seed a fixed demo trim range (11s-17s)
	// instead of the usual full-clip default.
	let isSampleFile = $state(false);
	let resultEl = $state<HTMLDivElement>();

	let source = $state<{ durationSec: number; width: number; height: number } | null>(null);
	let options = $state<GifOptions | null>(null);

	let videoUrl = $state<string | null>(null);
	let videoEl = $state<HTMLVideoElement>();
	let trackEl = $state<HTMLDivElement>();
	let draggingHandle = $state<'start' | 'end' | null>(null);
	// Trim-bar zoom: 1 = the whole clip is visible in the bar. A 20-minute
	// source at zoom 1 squeezes ~1200s into one bar width, so a 3s
	// selection is a handful of pixels wide and the two handles land on
	// top of each other -- zooming narrows the visible window so a short
	// selection can occupy most of the bar.
	let zoom = $state(1);
	let viewStartSec = $state(0);
	let isPreviewPlaying = $state(false);
	let showAdvanced = $state(false);
	let currentTimeSec = $state(0);
	let isScrubbing = $state(false);
	let thumbnails = $state<string[]>([]);
	// Bumped on every new file so a slow thumbnail generation for a file the
	// user has already replaced can't land its results late.
	let thumbGeneration = 0;

	let result = $state<{
		url: string;
		fileName: string;
		originalBytes: number;
		convertedBytes: number;
		width: number;
		height: number;
		frameCount: number;
	} | null>(null);

	let worker: Worker | undefined;

	// Created on first use, not on page load -- the worker bundles Mediabunny
	// and gifenc, and most visitors reading the page below never touch the
	// tool.
	function getWorker(): Worker | undefined {
		if (!browser) return undefined;
		if (worker) return worker;

		worker = new Worker(new URL('./video2gif.worker.ts', import.meta.url), {
			type: 'module'
		});
		worker.onerror = (event: ErrorEvent) => {
			console.error('[ConvertVideoToGif] worker crashed:', event.message, event);
			status = 'error';
			errorMessage = t.toolGif.errors.generic;
			track('convert_error', { error_code: 'worker_crash' });
		};
		worker.onmessageerror = (event: MessageEvent) => {
			console.error('[ConvertVideoToGif] worker message could not be deserialized:', event);
		};
		worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
			const data = event.data;

			if (data.type === 'probed') {
				source = data.source;
				options = defaultGifOptions(data.source);
				// The sample clip demos trimming out of the box: seed a fixed
				// 11s-17s range instead of the full clip, clamped in case the
				// sample is ever swapped for something shorter.
				if (isSampleFile) {
					const demoStart = Math.min(11, Math.max(0, data.source.durationSec - 1));
					const demoEnd = Math.min(17, data.source.durationSec);
					if (demoEnd > demoStart) {
						options.startSec = demoStart;
						options.endSec = demoEnd;
					}
				}
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
				console.error('[ConvertVideoToGif] worker reported an error:', data.message);
				status = 'error';
				errorMessage =
					data.code === 'no_video'
						? t.toolGif.errors.noVideo
						: data.code === 'unsupported_container'
							? t.toolGif.errors.unsupported
							: t.toolGif.errors.generic;
				track('convert_error', { error_code: data.code ?? 'worker_error' });
				return;
			}

			// done
			progress = 100;
			revokeResult();
			result = {
				url: URL.createObjectURL(data.blob),
				fileName: data.fileName,
				originalBytes: data.originalBytes,
				convertedBytes: data.convertedBytes,
				width: data.width,
				height: data.height,
				frameCount: data.frameCount
			};
			status = 'done';
			track('convert_success', {
				duration_ms: Date.now() - convertStartedAt,
				original_size_mb: roundMb(data.originalBytes),
				result_size_mb: roundMb(data.convertedBytes),
				frame_count: data.frameCount
			});
			tick().then(() => resultEl?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
		};

		return worker;
	}

	function revokeResult() {
		if (result) URL.revokeObjectURL(result.url);
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

	// Builds a filmstrip of small frame captures spanning the whole clip, so
	// the trim bar shows what's actually in the video instead of a flat bar.
	// Uses its own throwaway <video>, seeking frame by frame, rather than the
	// visible preview element (which the user may be scrubbing/playing at
	// the same time).
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

		// rangeStart/rangeEnd is the trim bar's current view window, not the
		// whole clip -- when zoomed in, the filmstrip re-samples just the
		// visible slice so the thumbs line up with what's on screen instead
		// of showing the same 12 whole-clip frames however far you zoom.
		const span = Math.max(0.1, rangeEndSec - rangeStartSec);
		const frames: string[] = [];
		for (let i = 0; i < THUMBNAIL_COUNT; i++) {
			if (generation !== thumbGeneration) return;
			const t = Math.min(
				rangeEndSec - 0.02,
				Math.max(rangeStartSec, rangeStartSec + (i / THUMBNAIL_COUNT) * span)
			);
			try {
				await seekVideo(vid, t);
				// Cover-crop each capture into a square so a portrait or
				// ultra-wide source still tiles cleanly into the filmstrip.
				const vw = vid.videoWidth || canvas.width;
				const vh = vid.videoHeight || canvas.height;
				const side = Math.min(vw, vh);
				ctx.drawImage(
					vid,
					(vw - side) / 2,
					(vh - side) / 2,
					side,
					side,
					0,
					0,
					canvas.width,
					canvas.height
				);
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

	// While a job is running (or we're still probing) the input file is
	// locked -- swapping it out from under an in-flight worker call would
	// leave the worker producing a result for a file the user can no longer
	// see. Cancel first, then change the file.
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

	// Used from the "done" result panel to start over with a new file,
	// without requiring the isBusy guard (conversion already finished).
	function convertAnother() {
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
			errorMessage = t.toolGif.errors.generic;
			track('convert_error', { error_code: 'sample_fetch_failed' });
		} finally {
			isSampleLoading = false;
		}
	}

	function startConversion() {
		const activeWorker = getWorker();
		if (!file || !options || !activeWorker) return;
		revokeResult();
		status = 'processing';
		stage = 'decoding';
		progress = 0;
		convertStartedAt = Date.now();
		track('convert_start', {
			fps: options.fps,
			max_width: String(options.maxWidth),
			colors: options.colors,
			dithering: options.dithering,
			loop: options.loop,
			speed: options.speed,
			reverse: options.reverse,
			crop: options.crop
		});
		activeWorker.postMessage({ type: 'convert', file, options: { ...options } });
	}

	function cancelConversion() {
		track('convert_cancel');
		worker?.postMessage({ type: 'cancel' });
		status = 'ready';
		progress = 0;
	}

	// --- Trim timeline -------------------------------------------------
	// Everything below maps pixels on the bar to seconds through the
	// current *view window* (viewStartSec .. viewStartSec + viewWindowSec)
	// instead of the whole clip -- at zoom 1 the window is the whole clip
	// (unchanged behavior for short videos), but zooming in narrows it so a
	// short selection inside a long video can still span most of the bar.
	const MAX_ZOOM = 60;
	const MIN_VIEW_WINDOW_SEC = 1;

	const viewWindowSec = $derived(
		source ? Math.max(MIN_VIEW_WINDOW_SEC, source.durationSec / zoom) : 0
	);
	const viewEndSec = $derived(
		source ? Math.min(source.durationSec, viewStartSec + viewWindowSec) : 0
	);

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

	// Re-samples the filmstrip for the current view window, debounced so a
	// run of wheel-zoom/pan events doesn't spawn a pile of concurrent seeks.
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

	// One click to frame the current selection with a bit of breathing
	// room -- the fix for "I roughly know where the cut goes, now let me
	// see it big enough to actually place the edges".
	function zoomToSelection() {
		if (!source || !options) return;
		const span = Math.max(options.endSec - options.startSec, MIN_VIEW_WINDOW_SEC);
		const padded = span * 1.6;
		zoom = Math.min(MAX_ZOOM, Math.max(1, source.durationSec / padded));
		const nextWindow = Math.max(MIN_VIEW_WINDOW_SEC, source.durationSec / zoom);
		viewStartSec = clampViewStart((options.startSec + options.endSec) / 2 - nextWindow / 2);
		scheduleThumbRefresh();
	}

	// Wheel over the timeline: a plain scroll (or shift+scroll, for
	// mice with only a vertical wheel) pans the view; ctrl/cmd+scroll --
	// which is also how browsers report a trackpad pinch -- zooms around
	// the cursor position.
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

	function updateHandleFromClientX(which: 'start' | 'end', clientX: number) {
		if (!trackEl || !source || !options) return;
		const rect = trackEl.getBoundingClientRect();
		const percent = ((clientX - rect.left) / rect.width) * 100;
		const sec = viewPercentToSec(percent);
		// Keep at least a tenth of a second (or a tenth of the clip, for very
		// short clips) between the two handles so they can never cross.
		const minGap = Math.min(0.1, source.durationSec / 10);

		if (which === 'start') {
			options.startSec = Math.min(Math.max(0, sec), options.endSec - minGap);
		} else {
			options.endSec = Math.max(Math.min(source.durationSec, sec), options.startSec + minGap);
		}

		if (videoEl) videoEl.currentTime = which === 'start' ? options.startSec : options.endSec;
	}

	// setPointerCapture/releasePointerCapture must be called on the element
	// that actually received the pointerdown (event.target), not on
	// whatever the listener happens to be attached to -- the move/up
	// listeners below live on svelte:window, so their currentTarget is the
	// window, which has no such method.
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

	// Arrow keys nudge the focused handle by a small step (a full second
	// with Shift) -- the precise fallback for lining up a handle exactly
	// when even a zoomed-in drag isn't fine enough.
	function onHandleKeydown(which: 'start' | 'end', event: KeyboardEvent) {
		if (isBusy || !source || !options) return;
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
		event.preventDefault();
		const step = event.shiftKey ? 1 : 1 / 30;
		const delta = event.key === 'ArrowLeft' ? -step : step;
		const minGap = Math.min(0.1, source.durationSec / 10);
		if (which === 'start') {
			options.startSec = Math.min(Math.max(0, options.startSec + delta), options.endSec - minGap);
			if (videoEl) videoEl.currentTime = options.startSec;
		} else {
			options.endSec = Math.max(
				Math.min(source.durationSec, options.endSec + delta),
				options.startSec + minGap
			);
			if (videoEl) videoEl.currentTime = options.endSec;
		}
	}

	// Dragging (or tapping) anywhere on the track scrubs the preview across
	// the current view window -- so people can explore the footage to
	// decide where the cut should go before touching the start/end handles.
	function scrubToClientX(clientX: number) {
		if (!trackEl || !source || !videoEl) return;
		const rect = trackEl.getBoundingClientRect();
		const percent = ((clientX - rect.left) / rect.width) * 100;
		const sec = viewPercentToSec(percent);
		videoEl.currentTime = sec;
		currentTimeSec = sec;
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

	// Preview playback plays only the trimmed range on loop, so users can
	// actually see what they're about to export instead of guessing from a
	// static frame.
	function togglePreviewPlay() {
		if (!videoEl || !options) return;
		if (isPreviewPlaying) {
			videoEl.pause();
			return;
		}
		if (videoEl.currentTime < options.startSec || videoEl.currentTime >= options.endSec) {
			videoEl.currentTime = options.startSec;
		}
		videoEl.play();
	}

	// Always track the playhead position (for the moving marker on the trim
	// bar), but only loop the play range back to start while actually
	// playing -- a manual scrub past endSec shouldn't get yanked back.
	function onPreviewTimeUpdate() {
		if (!videoEl) return;
		currentTimeSec = videoEl.currentTime;
		if (!options || !isPreviewPlaying) return;
		if (videoEl.currentTime >= options.endSec) {
			videoEl.currentTime = options.startSec;
			videoEl.play();
		}
	}

	// Typed mm:ss(.s) entry for the two handles -- an exact, zoom-independent
	// way to set a precise range in a long clip, since even a zoomed-in drag
	// still has a pixel granularity floor.
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

	function onStartTimeInput(event: Event) {
		if (!source || !options) return;
		const sec = parseTimeInput((event.currentTarget as HTMLInputElement).value, source.durationSec);
		if (sec === null) return;
		const minGap = Math.min(0.1, source.durationSec / 10);
		options.startSec = Math.min(sec, options.endSec - minGap);
		if (videoEl) videoEl.currentTime = options.startSec;
	}

	function onEndTimeInput(event: Event) {
		if (!source || !options) return;
		const sec = parseTimeInput((event.currentTarget as HTMLInputElement).value, source.durationSec);
		if (sec === null) return;
		const minGap = Math.min(0.1, source.durationSec / 10);
		options.endSec = Math.max(sec, options.startSec + minGap);
		if (videoEl) videoEl.currentTime = options.endSec;
	}

	const startPercent = $derived(
		source && options ? Math.min(100, Math.max(0, secToViewPercent(options.startSec))) : 0
	);
	const endPercent = $derived(
		source && options ? Math.min(100, Math.max(0, secToViewPercent(options.endSec))) : 100
	);
	const playheadPercent = $derived(
		source ? Math.min(100, Math.max(0, secToViewPercent(currentTimeSec))) : 0
	);
	const trimmedDurationSec = $derived(options ? Math.max(0, options.endSec - options.startSec) : 0);

	// Only list max-width presets that don't exceed the source's own width --
	// showing e.g. 720px for a 360p source is pointless since it just gets
	// silently clamped back down to 360 at encode time (see clampMaxWidth in
	// plan.ts); it just reads as a choice that quietly does nothing.
	const availableResolutions = $derived(source ? availableGifResolutions(source) : []);

	const estimatedBytes = $derived(source && options ? estimateGifSizeBytes(source, options) : 0);

	const progressLabel = $derived.by(() => {
		if (status === 'done') return t.toolGif.progress.done;
		if (stage === 'decoding') return t.toolGif.progress.decoding;
		if (stage === 'quantizing') return t.toolGif.progress.quantizing;
		return t.toolGif.progress.encoding;
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
				<path d="M12 16V4M12 4l-4 4M12 4l4 4" />
				<path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
			</svg>
		</span>
		<div class="dz-text">
			<p class="dz-title">
				{t.toolGif.dropzone.titlePrefix}
				<button type="button" disabled={isBusy} onclick={() => fileInputEl?.click()}>
					{t.toolGif.dropzone.browse}
				</button>
			</p>
			<p class="dz-sub">
				{t.toolGif.dropzone.subtitle}
				<button type="button" class="dz-sample" disabled={isBusy} onclick={loadSample}>
					{t.toolGif.dropzone.loadSample}
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
		<button class="remove" title={t.toolGif.fileInfo.remove} disabled={isBusy} onclick={removeFile}>
			✕
		</button>
	</div>

	<div class="controls" class:show={file !== null && source !== null && options !== null}>
		{#if source && options}
			<div class="field">
				<!-- <label for="gif-trim">{t.toolGif.trim.label}</label> -->
				<div class="trim-preview-wrap">
					<!-- svelte-ignore a11y_media_has_caption -- muted scrub preview, no dialogue to caption -->
					<video
						bind:this={videoEl}
						src={videoUrl}
						class="trim-preview"
						muted
						loop
						playsinline
						preload="metadata"
						ontimeupdate={onPreviewTimeUpdate}
						onplay={() => (isPreviewPlaying = true)}
						onpause={() => (isPreviewPlaying = false)}
					></video>
					<button
						type="button"
						class="preview-play-btn"
						aria-label={isPreviewPlaying ? t.toolGif.trim.pause : t.toolGif.trim.play}
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
						aria-label={t.toolGif.trim.zoomOut}
						onclick={zoomOut}
					>
						−
					</button>
					<span class="zoom-level">{zoom.toFixed(1)}×</span>
					<button
						type="button"
						class="zoom-btn"
						disabled={isBusy || zoom >= MAX_ZOOM}
						aria-label={t.toolGif.trim.zoomIn}
						onclick={zoomIn}
					>
						+
					</button>
					<button type="button" class="zoom-link" disabled={isBusy} onclick={zoomToSelection}>
						{t.toolGif.trim.zoomToSelection}
					</button>
					{#if zoom > 1}
						<button type="button" class="zoom-link" disabled={isBusy} onclick={resetZoom}>
							{t.toolGif.trim.zoomReset}
						</button>
					{/if}
				</div>
				<div
					class="trim-timeline"
					id="gif-trim"
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
					<div class="trim-mask trim-mask-left" style="width:{startPercent}%"></div>
					<div class="trim-mask trim-mask-right" style="width:{100 - endPercent}%"></div>
					<div class="trim-playhead" style="left:{playheadPercent}%" aria-hidden="true"></div>
					<div
						class="trim-handle trim-handle-start"
						style="left:{startPercent}%"
						role="slider"
						tabindex="0"
						aria-label={t.toolGif.trim.start}
						aria-valuemin={0}
						aria-valuemax={options.endSec}
						aria-valuenow={options.startSec}
						onpointerdown={(e) => onHandlePointerDown('start', e)}
						onkeydown={(e) => onHandleKeydown('start', e)}
					></div>
					<div
						class="trim-handle trim-handle-end"
						style="left:{endPercent}%"
						role="slider"
						tabindex="0"
						aria-label={t.toolGif.trim.end}
						aria-valuemin={options.startSec}
						aria-valuemax={source.durationSec}
						aria-valuenow={options.endSec}
						onpointerdown={(e) => onHandlePointerDown('end', e)}
						onkeydown={(e) => onHandleKeydown('end', e)}
					></div>
				</div>
				<div class="trim-time-inputs">
					<label class="trim-time-field">
						<span>{t.toolGif.trim.start}</span>
						<input
							type="text"
							inputmode="decimal"
							disabled={isBusy}
							value={formatTime(options.startSec)}
							onchange={onStartTimeInput}
						/>
					</label>
					<label class="trim-time-field">
						<span>{t.toolGif.trim.end}</span>
						<input
							type="text"
							inputmode="decimal"
							disabled={isBusy}
							value={formatTime(options.endSec)}
							onchange={onEndTimeInput}
						/>
					</label>
				</div>
				<p class="hint" style="margin-bottom:0;">
					{fill(t.toolGif.trim.hint, {
						start: formatTime(options.startSec),
						end: formatTime(options.endSec),
						duration: formatTime(trimmedDurationSec)
					})}
				</p>
			</div>

			<div class="settings-list">
				<div class="setting-row">
					<span class="setting-label" id="gif-fps-label">{t.toolGif.fps.label}</span>
					<select
						class="setting-select"
						aria-labelledby="gif-fps-label"
						disabled={isBusy}
						bind:value={options.fps}
					>
						{#each GIF_FPS_OPTIONS as opt (opt)}
							<option value={opt}>{opt} fps</option>
						{/each}
					</select>
				</div>

				<div class="setting-row">
					<span class="setting-label" id="gif-resolution-label">{t.toolGif.resolution.label}</span>
					<select
						class="setting-select"
						aria-labelledby="gif-resolution-label"
						disabled={isBusy}
						bind:value={options.maxWidth}
					>
						{#each availableResolutions as opt (opt)}
							<option value={opt}>{opt === 'original' ? t.toolGif.resolution.optionOriginal : `${opt}px`}</option>
						{/each}
					</select>
				</div>

				<button
					type="button"
					class="setting-row advanced-toggle"
					aria-expanded={showAdvanced}
					onclick={() => (showAdvanced = !showAdvanced)}
				>
					<span class="setting-label">{t.toolGif.advanced.toggle}</span>
					<span class="chevron" class:is-open={showAdvanced} aria-hidden="true">▾</span>
				</button>

				{#if showAdvanced}
					<div class="setting-row">
						<span class="setting-label" id="gif-colors-label">{t.toolGif.quality.colorsLabel}</span>
						<select
							class="setting-select"
							aria-labelledby="gif-colors-label"
							disabled={isBusy}
							bind:value={options.colors}
						>
							{#each GIF_COLOR_OPTIONS as opt (opt)}
								<option value={opt}>{opt}</option>
							{/each}
						</select>
					</div>

					<div class="setting-row">
						<span class="setting-label">{t.toolGif.quality.ditheringLabel}</span>
						<label class="switch">
							<input type="checkbox" disabled={isBusy} bind:checked={options.dithering} />
							<span class="switch-track"></span>
							<span class="switch-thumb"></span>
						</label>
					</div>

					<div class="setting-row">
						<span class="setting-label" id="gif-crop-label">{t.toolGif.crop.label}</span>
						<select
							class="setting-select"
							aria-labelledby="gif-crop-label"
							disabled={isBusy}
							bind:value={options.crop}
						>
							{#each GIF_CROP_PRESETS as opt (opt)}
								<option value={opt}>{t.toolGif.crop.options[opt]}</option>
							{/each}
						</select>
					</div>

					<div class="setting-row">
						<span class="setting-label" id="gif-loop-label">{t.toolGif.loop.label}</span>
						<select
							class="setting-select"
							aria-labelledby="gif-loop-label"
							disabled={isBusy}
							bind:value={options.loop}
						>
							<option value="infinite">{t.toolGif.loop.infinite}</option>
							<option value="once">{t.toolGif.loop.once}</option>
						</select>
					</div>

					<div class="setting-row">
						<span class="setting-label" id="gif-speed-label">{t.toolGif.speed.label}</span>
						<select
							class="setting-select"
							aria-labelledby="gif-speed-label"
							disabled={isBusy}
							bind:value={options.speed}
						>
							{#each GIF_SPEED_OPTIONS as opt (opt)}
								<option value={opt}>{opt}x</option>
							{/each}
						</select>
					</div>

					<div class="setting-row">
						<span class="setting-label">{t.toolGif.reverse.label}</span>
						<label class="switch">
							<input type="checkbox" disabled={isBusy} bind:checked={options.reverse} />
							<span class="switch-track"></span>
							<span class="switch-thumb"></span>
						</label>
					</div>
				{/if}
			</div>

			<!-- <p class="estimate-note">{fill(t.toolGif.estimate.label, { size: formatSize(estimatedBytes) })}</p> -->
		{/if}
	</div>

	{#if status === 'processing'}
		<button class="squish-btn is-processing" onclick={cancelConversion}>
			<span class="squish-btn-fill" style="width: {progress}%"></span>
			<span class="squish-btn-label">
				<span class="squish-btn-text">{progressLabel}</span>
				<span class="squish-btn-pct">{progress}% · {t.toolGif.button.cancel}</span>
			</span>
		</button>
	{:else}
		<button class="squish-btn" disabled={!file || !options || isBusy} onclick={startConversion}>
			{t.toolGif.button.idle}
		</button>
	{/if}

	{#if status === 'error'}
		<p class="tool-error">{errorMessage}</p>
	{/if}

	<div class="result" class:show={status === 'done' && result !== null} bind:this={resultEl}>
		{#if result}
			<div class="gif-frame">
				<img src={result.url} alt={t.toolGif.result.statLabel} class="gif-preview" />
			</div>
			<div class="stat">{formatSize(result.convertedBytes)}</div>
			<div class="stat-label">
				{fill(t.toolGif.result.statLabel, { width: result.width, height: result.height })}
			</div>
			<p class="result-summary">
				{fill(t.toolGif.result.summary, {
					frames: result.frameCount,
					from: formatSize(result.originalBytes)
				})}
			</p>

			<div class="result-actions">
				<a
					href={result.url}
					download={result.fileName}
					class="download-btn"
					onclick={() => track('download')}
				>
					{t.toolGif.result.download}
				</a>
				<button type="button" class="compress-new-btn" onclick={convertAnother}>
					{t.toolGif.result.convertNew}
				</button>
			</div>

			<SupportLink />
		{/if}
	</div>

	<div class="privacy-note"><span class="dot"></span>{t.toolGif.privacyNote}</div>
</div>

<ShareRow title={shareTitle} />

<hr class="content-divider" />

<style>
	/* --- Trim preview: spans the same width as the rest of the card, with --
	   the HEIGHT capped (not the width) -- a portrait or odd-ratio source
	   letterboxes/pillarboxes inside instead of stretching the box taller. */
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

	/* --- Trim bar: an actual filmstrip of the clip, with a filled range and --
	   grip handles at the edges, instead of a flat progress-bar slider. */
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

	/* Moving marker for the current playback/scrub position, spanning the
	   whole clip (not clamped to the trim range) so exploring outside the
	   current selection is visible too. */
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

	/* --- Zoom row above the trim bar: for a long source, zooming is what --
	   makes a short selection possible to grab at all instead of the two
	   handles landing a couple of pixels apart. */
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

	/* --- Typed start/end time entry: an exact fallback alongside the drag --
	   handles, since even a zoomed-in bar still has a pixel granularity
	   floor for very precise cuts. */
	.trim-time-inputs {
		display: flex;
		gap: 10px;
		margin-top: 8px;
		width: 100%;
		min-width: 0;
	}

	.trim-time-field {
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 12px;
		color: var(--muted, #6b7a73);
	}

	.trim-time-field input {
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		font: inherit;
		font-variant-numeric: tabular-nums;
		padding: 6px 8px;
		border-radius: var(--radius-sm);
		border: 1.5px solid var(--line);
		background: transparent;
		color: inherit;
	}

	.trim-time-field input:disabled {
		opacity: 0.5;
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
		min-width: 118px;
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

	/* Compact on/off switch for the two boolean settings. */
	.switch {
		position: relative;
		display: inline-block;
		width: 38px;
		height: 22px;
		flex-shrink: 0;
	}

	.switch input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: pointer;
		z-index: 1;
	}

	.switch-track {
		position: absolute;
		inset: 0;
		border-radius: 999px;
		background: var(--line);
		transition: background 0.15s ease;
	}

	.switch-thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
		transition: transform 0.15s ease;
	}

	.switch input:checked ~ .switch-track {
		background: var(--coral);
	}

	.switch input:checked ~ .switch-thumb {
		transform: translateX(16px);
	}

	.switch input:disabled ~ .switch-track {
		opacity: 0.55;
	}

	.switch input:disabled {
		cursor: not-allowed;
	}

	.advanced-toggle {
		width: 100%;
		border: none;
		background: none;
		font-family: inherit;
		text-align: left;
		cursor: pointer;
	}

	.advanced-toggle:hover .setting-label {
		color: var(--teal, var(--coral));
		text-decoration: underline;
	}

	.advanced-toggle .setting-label {
		color: var(--teal);
	}

	.advanced-toggle .chevron {
		display: inline-block;
		color: var(--teal);
		transition: transform 0.15s ease;
	}

	.advanced-toggle .chevron.is-open {
		transform: rotate(180deg);
	}

	/* Small, quiet notice -- not a callout, just needed *some* CSS since it
	   used to inherit none at all (sat outside .field, so the shared
	   ".field .hint" rule never reached it). */
	/* .estimate-note {
		margin-top: 10px;
		font-size: 11.5px;
		color: var(--muted);
	} */

	/* Same frame treatment as the trim preview above -- black letterbox
	   box, height capped rather than width -- so a GIF much smaller than
	   the card still sits centered instead of floating lopsided. */
	.gif-frame {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		margin-bottom: 10px;
		border-radius: var(--radius-sm);
		overflow: hidden;
		background: #000;
	}

	.gif-preview {
		display: block;
		max-width: 100%;
		max-height: 400px;
		width: auto;
		height: auto;
		object-fit: contain;
	}

	@media (max-width: 480px) {
		.gif-preview {
			max-height: 160px;
		}
	}
</style>

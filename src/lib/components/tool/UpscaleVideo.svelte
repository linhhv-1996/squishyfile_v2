<script lang="ts">
	// The tool UI only. Every bit of upscaling logic runs inside
	// upscale.worker.ts (which itself routes to either the IMDN AI model or
	// the FSR shader path based on source resolution) -- this component just
	// reflects worker messages into state and never does any processing
	// itself. Structural twin of CompressVideo.svelte / ConvertVideoToMp3.svelte.
	import { onDestroy, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { getStrings } from '$lib/i18n';
	import ShareRow from '$lib/components/share/ShareRow.svelte';
	import SupportLink from '$lib/components/support/SupportLink.svelte';
	import BeforeAfterVideoSlider from './BeforeAfterVideoSlider.svelte';
	import { UPSCALE_SCALES, type UpscaleEngine, type UpscaleScale } from '$lib/upscale/plan';
	import type { WorkerOutMessage } from './upscale-fsrcnn.worker';

	let { shareTitle = '' }: { shareTitle?: string } = $props();

	const t = getStrings();

	type Stage = 'probing' | 'loading-engine' | 'initializing-engine' | 'encoding';

	let file = $state<File | null>(null);
	let isDragging = $state(false);
	let scale = $state<UpscaleScale>(2);
	// Captured when a run starts -- shown in the result panel even if the
	// user fiddles with the scale picker afterwards.
	let usedScale = $state<UpscaleScale>(2);
	let status = $state<'idle' | 'processing' | 'done' | 'error'>('idle');
	let progress = $state(0);
	let stage = $state<Stage>('probing');
	let engine = $state<UpscaleEngine | null>(null);
	let errorMessage = $state('');
	let fileInputEl = $state<HTMLInputElement>();
	let isSampleLoading = $state(false);
	let resultEl = $state<HTMLDivElement>();
	// Object URL for the source file, created once a run finishes so the
	// before/after modal has something to show next to the upscaled
	// result -- not created up front since most runs never open the modal.
	let originalPreviewUrl = $state<string | null>(null);
	let viewResultOpen = $state(false);

	let result = $state<{
		url: string;
		fileName: string;
		originalBytes: number;
		newBytes: number;
		srcWidth: number;
		srcHeight: number;
		outWidth: number;
		outHeight: number;
		scale: UpscaleScale;
		engine: UpscaleEngine;
	} | null>(null);

	let worker: Worker | undefined;

	// Created on first use, not on page load -- the worker bundles Mediabunny
	// and onnxruntime-web's WASM/WebGPU runtime, and most visitors reading the
	// page below never touch the tool.
	function getWorker(): Worker | undefined {
		if (!browser) return undefined;
		if (worker) return worker;

		worker = new Worker(new URL('./upscale-fsrcnn.worker.ts', import.meta.url), {
			type: 'module'
		});
		worker.onerror = (event: ErrorEvent) => {
			console.error('[UpscaleVideo] worker crashed:', event.message, event);
			status = 'error';
			errorMessage = t.toolUpscale.errors.generic;
		};
		worker.onmessageerror = (event: MessageEvent) => {
			console.error('[UpscaleVideo] worker message could not be deserialized:', event);
		};
		worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
			const data = event.data;

			if (data.type === 'progress') {
				progress = data.progress;
				stage = data.stage;
				engine = data.engine;
				return;
			}

			if (data.type === 'error') {
				console.error('[UpscaleVideo] worker reported an error:', data.message);
				status = 'error';
				errorMessage = t.toolUpscale.errors.generic;
				return;
			}

			// done
			progress = 100;
			revokeResult();
			// `file` is still the file this run was started with -- isBusy
			// keeps the input locked for the whole run, so it can't have
			// changed out from under us.
			if (file) originalPreviewUrl = URL.createObjectURL(file);
			result = {
				url: URL.createObjectURL(data.blob),
				fileName: data.fileName,
				originalBytes: data.originalBytes,
				newBytes: data.newBytes,
				srcWidth: data.srcWidth,
				srcHeight: data.srcHeight,
				outWidth: data.outWidth,
				outHeight: data.outHeight,
				scale: data.scale,
				engine: data.engine
			};
			status = 'done';
			tick().then(() => resultEl?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
		};

		return worker;
	}

	function revokeResult() {
		if (result) URL.revokeObjectURL(result.url);
		result = null;
		if (originalPreviewUrl) URL.revokeObjectURL(originalPreviewUrl);
		originalPreviewUrl = null;
		viewResultOpen = false;
	}

	onDestroy(() => {
		revokeResult();
		worker?.terminate();
	});

	function formatSize(bytes: number) {
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	}

	function fill(template: string, values: Record<string, string | number>) {
		return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
	}

	function reset() {
		status = 'idle';
		progress = 0;
		stage = 'probing';
		engine = null;
		errorMessage = '';
		revokeResult();
	}

	function handleFile(next: File | null | undefined) {
		if (!next) return;
		file = next;
		reset();
	}

	function onFileInputChange(event: Event) {
		handleFile((event.currentTarget as HTMLInputElement).files?.[0]);
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		isDragging = false;
		if (isBusy) return;
		handleFile(event.dataTransfer?.files?.[0]);
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
	// user can no longer see. Cancel first, then change the file.
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

	function removeFile() {
		if (isBusy) return;
		if (fileInputEl) fileInputEl.value = '';
		file = null;
		reset();
	}

	// Used from the "done" result panel to start over with a new file,
	// without requiring the isBusy guard (the run already finished).
	function upscaleAnother() {
		if (fileInputEl) fileInputEl.value = '';
		file = null;
		reset();
	}

	async function loadSample() {
		if (isBusy) return;
		isSampleLoading = true;
		try {
			const response = await fetch('/6568706-sd_426_226_25fps.mp4');
			if (!response.ok) throw new Error('sample fetch failed');
			const blob = await response.blob();
			handleFile(new File([blob], '6568706-sd_426_226_25fps.mp4', { type: 'video/mp4' }));
		} catch {
			status = 'error';
			errorMessage = t.toolUpscale.errors.generic;
		} finally {
			isSampleLoading = false;
		}
	}

	function startUpscale() {
		const activeWorker = getWorker();
		if (!file || !activeWorker) return;
		reset();
		usedScale = scale;
		status = 'processing';
		stage = 'probing';
		activeWorker.postMessage({ type: 'upscale', file, scale });
	}

	function cancelUpscale() {
		worker?.postMessage({ type: 'cancel' });
		reset();
	}

	const progressLabel = $derived.by(() => {
		if (status === 'done') return t.toolUpscale.progress.done;
		if (stage === 'probing') return t.toolUpscale.progress.probing;
		if (stage === 'loading-engine') return t.toolUpscale.progress.loadingEngine;
		if (stage === 'initializing-engine') return t.toolUpscale.progress.initializingEngine;
		if (engine === 'ai') return t.toolUpscale.progress.encodingAi;
		return t.toolUpscale.progress.encodingFsr;
	});

	function engineLabel(e: UpscaleEngine) {
		return e === 'ai' ? t.toolUpscale.result.engineAi : t.toolUpscale.result.engineFsr;
	}
</script>

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
				{t.toolUpscale.dropzone.titlePrefix}
				<button type="button" disabled={isBusy} onclick={() => fileInputEl?.click()}>
					{t.toolUpscale.dropzone.browse}
				</button>
			</p>
			<p class="dz-sub">
				{t.toolUpscale.dropzone.subtitle}
				<button type="button" class="dz-sample" disabled={isBusy} onclick={loadSample}>
					{t.toolUpscale.dropzone.loadSample}
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

	<div class="file-info" class:show={file !== null}>
		<span class="fname">{file?.name ?? ''}</span>
		<span class="fsize">{file ? formatSize(file.size) : ''}</span>
		<button class="remove" title={t.toolUpscale.fileInfo.remove} disabled={isBusy} onclick={removeFile}>
			✕
		</button>
	</div>

	<div class="controls" class:show={file !== null}>
		<div class="field">
			<label for="upscaleFactor">{t.toolUpscale.scale.label}</label>
			<div class="quality-choices" id="upscaleFactor" role="group" aria-label={t.toolUpscale.scale.label}>
				{#each UPSCALE_SCALES as option (option)}
					<button
						type="button"
						class="quality-choice"
						class:is-active={scale === option}
						disabled={isBusy}
						onclick={() => (scale = option)}
					>
						{t.toolUpscale.scale.options[String(option) as '2' | '4']}
					</button>
				{/each}
			</div>
			<p class="hint">{t.toolUpscale.scale.hint}</p>
		</div>
	</div>

	{#if status === 'processing'}
		<button class="squish-btn is-processing" onclick={cancelUpscale}>
			<span class="squish-btn-fill" style="width: {progress}%"></span>
			<span class="squish-btn-label">
				<span class="squish-btn-text">{progressLabel}</span>
				<span class="squish-btn-pct">{progress}% · {t.toolUpscale.button.cancel}</span>
			</span>
		</button>
	{:else}
		<button class="squish-btn" disabled={!file} onclick={startUpscale}>
			{t.toolUpscale.button.idle}
		</button>
	{/if}

	{#if status === 'error'}
		<p class="tool-error">{errorMessage}</p>
	{/if}

	<div class="result" class:show={status === 'done' && result !== null} bind:this={resultEl}>
		{#if result}
			<div class="stat">{fill(t.toolUpscale.result.statLabel, { scale: result.scale })}</div>
			<p class="result-summary">
				{fill(t.toolUpscale.result.summary, {
					fromWidth: result.srcWidth,
					fromHeight: result.srcHeight,
					toWidth: result.outWidth,
					toHeight: result.outHeight,
					engine: engineLabel(result.engine)
				})}
			</p>

			<div class="result-actions">
				{#if originalPreviewUrl}
					<button type="button" class="compress-new-btn" onclick={() => (viewResultOpen = true)}>
						{t.toolUpscale.result.viewResult}
					</button>
				{/if}
				<a href={result.url} download={result.fileName} class="download-btn">
					{t.toolUpscale.result.download}
				</a>
				<button type="button" class="compress-new-btn" onclick={upscaleAnother}>
					{t.toolUpscale.result.upscaleNew}
				</button>
			</div>

			<SupportLink />
		{/if}
	</div>

	<div class="privacy-note"><span class="dot"></span>{t.toolUpscale.privacyNote}</div>
</div>

<ShareRow title={shareTitle} />

<hr class="content-divider" />

{#if originalPreviewUrl && result}
	<BeforeAfterVideoSlider
		bind:open={viewResultOpen}
		beforeUrl={originalPreviewUrl}
		afterUrl={result.url}
		beforeLabel="Original"
		afterLabel="Upscaled"
	/>
{/if}

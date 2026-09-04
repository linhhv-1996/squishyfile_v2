<script lang="ts">
	// The tool UI only. Every bit of conversion logic runs inside
	// video2mp3.worker.ts -- this component just reflects worker messages
	// into state and never does any processing itself. Structural twin of
	// CompressVideo.svelte, simplified where MP3 conversion doesn't need the
	// compression tool's machinery (no resolution/target-size fields).
	import { onDestroy, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { getStrings } from '$lib/i18n';
	import ShareRow from '$lib/components/share/ShareRow.svelte';
	import SupportLink from '$lib/components/support/SupportLink.svelte';
	import { MP3_QUALITIES, type Mp3Quality } from '$lib/video2mp3/plan';
	import type { WorkerOutMessage } from './video2mp3.worker';

	let {
		shareTitle = '',
		samplePath = '/7-Coding-Laws-of-Senior-Developer.mp4',
		sampleFileName = '7-Coding-Laws-of-Senior-Developer.mp4',
		sampleMimeType = 'video/mp4'
	}: {
		shareTitle?: string;
		samplePath?: string;
		sampleFileName?: string;
		sampleMimeType?: string;
	} = $props();

	const t = getStrings();

	type Stage = 'probing' | 'loading-engine' | 'encoding';

	let file = $state<File | null>(null);
	let isDragging = $state(false);
	let quality = $state<Mp3Quality>(192);
	// Captured when a conversion starts -- shown in the result panel even if
	// the user fiddles with the quality picker afterwards.
	let usedQuality = $state<Mp3Quality>(192);
	let status = $state<'idle' | 'processing' | 'done' | 'error'>('idle');
	let progress = $state(0);
	let stage = $state<Stage>('probing');
	let errorMessage = $state('');
	let fileInputEl = $state<HTMLInputElement>();
	let resultEl = $state<HTMLDivElement>();

	let result = $state<{
		url: string;
		fileName: string;
		originalBytes: number;
		convertedBytes: number;
		durationSec: number;
		quality: Mp3Quality;
	} | null>(null);

	let worker: Worker | undefined;

	// Created on first use, not on page load -- the worker bundles Mediabunny
	// (~550 kB) and most visitors reading the page below never touch the tool.
	function getWorker(): Worker | undefined {
		if (!browser) return undefined;
		if (worker) return worker;

		worker = new Worker(new URL('./video2mp3.worker.ts', import.meta.url), {
			type: 'module'
		});
		worker.onerror = (event: ErrorEvent) => {
			console.error('[ConvertVideoToMp3] worker crashed:', event.message, event);
			status = 'error';
			errorMessage = t.toolMp3.errors.generic;
		};
		worker.onmessageerror = (event: MessageEvent) => {
			console.error('[ConvertVideoToMp3] worker message could not be deserialized:', event);
		};
		worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
			const data = event.data;

			if (data.type === 'progress') {
				progress = data.progress;
				stage = data.stage;
				return;
			}

			if (data.type === 'error') {
				console.error('[ConvertVideoToMp3] worker reported an error:', data.message);
				status = 'error';
				errorMessage = data.code === 'no_audio' ? t.toolMp3.errors.noAudio : t.toolMp3.errors.generic;
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
				durationSec: data.durationSec,
				quality: usedQuality
			};
			status = 'done';
			tick().then(() => resultEl?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
		};

		return worker;
	}

	function revokeResult() {
		if (result) URL.revokeObjectURL(result.url);
		result = null;
	}

	onDestroy(() => {
		revokeResult();
		worker?.terminate();
	});

	function formatSize(bytes: number) {
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	}

	function formatDuration(totalSeconds: number) {
		const s = Math.max(0, Math.round(totalSeconds));
		const m = Math.floor(s / 60);
		const rem = s % 60;
		return `${m}:${String(rem).padStart(2, '0')}`;
	}

	function fill(template: string, values: Record<string, string | number>) {
		return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
	}

	function reset() {
		status = 'idle';
		progress = 0;
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
	// it mid-convert would leave the worker producing a result for a file the
	// user can no longer see. Cancel first, then change the file.
	const isBusy = $derived(status === 'processing');

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
	// without requiring the isBusy guard (conversion already finished).
	function convertAnother() {
		if (fileInputEl) fileInputEl.value = '';
		file = null;
		reset();
	}

	async function loadSample() {
		if (isBusy) return;
		try {
			// This tool's sample needs an actual audio track -- the
			// compression tool's sample clip (13069876_1280_720_30fps.mp4) is
			// silent, so this uses a dedicated tone-and-testcard clip instead.
			// Which file loads is per-route: samplePath/sampleFileName/sampleMimeType
			// props default to the MP4 clip but mov-to-mp3 overrides them to the
			// matching .mov file so the sample actually matches the page's format.
			const response = await fetch(samplePath);
			if (!response.ok) throw new Error('sample fetch failed');
			const blob = await response.blob();
			handleFile(new File([blob], sampleFileName, { type: sampleMimeType }));
		} catch {
			status = 'error';
			errorMessage = t.toolMp3.errors.generic;
		}
	}

	function startConversion() {
		const activeWorker = getWorker();
		if (!file || !activeWorker) return;
		reset();
		usedQuality = quality;
		status = 'processing';
		stage = 'probing';
		activeWorker.postMessage({ type: 'convert', file, quality });
	}

	function cancelConversion() {
		worker?.postMessage({ type: 'cancel' });
		reset();
	}

	const progressLabel = $derived.by(() => {
		if (status === 'done') return t.toolMp3.progress.done;
		if (stage === 'probing') return t.toolMp3.progress.probing;
		if (stage === 'loading-engine') return t.toolMp3.progress.loadingEngine;
		return t.toolMp3.progress.label;
	});
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
		<span class="icon">
			<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M12 16V4M12 4l-4 4M12 4l4 4" />
				<path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
			</svg>
		</span>
		<div class="dz-text">
			<p class="dz-title">
				{t.toolMp3.dropzone.titlePrefix}
				<button type="button" disabled={isBusy} onclick={() => fileInputEl?.click()}>
					{t.toolMp3.dropzone.browse}
				</button>
			</p>
			<p class="dz-sub">
				{t.toolMp3.dropzone.subtitle}
				<button type="button" class="dz-sample" disabled={isBusy} onclick={loadSample}>
					{t.toolMp3.dropzone.loadSample}
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
		<button class="remove" title={t.toolMp3.fileInfo.remove} disabled={isBusy} onclick={removeFile}>
			✕
		</button>
	</div>

	<div class="controls" class:show={file !== null}>
		<div class="field">
			<label for="mp3quality">{t.toolMp3.quality.label}</label>
			<div class="quality-choices" id="mp3quality" role="group" aria-label={t.toolMp3.quality.label}>
				{#each MP3_QUALITIES as option (option)}
					<button
						type="button"
						class="quality-choice"
						class:is-active={quality === option}
						disabled={isBusy}
						onclick={() => (quality = option)}
					>
						{t.toolMp3.quality.options[String(option) as '128' | '192' | '320']}
					</button>
				{/each}
			</div>
			<p class="hint">{t.toolMp3.quality.hint}</p>
		</div>
	</div>

	{#if status === 'processing'}
		<button class="squish-btn is-processing" onclick={cancelConversion}>
			<span class="squish-btn-fill" style="width: {progress}%"></span>
			<span class="squish-btn-label">
				<span class="squish-btn-text">{progressLabel}</span>
				<span class="squish-btn-pct">{progress}% · {t.toolMp3.button.cancel}</span>
			</span>
		</button>
	{:else}
		<button class="squish-btn" disabled={!file} onclick={startConversion}>
			{t.toolMp3.button.idle}
		</button>
	{/if}

	{#if status === 'error'}
		<p class="tool-error">{errorMessage}</p>
	{/if}

	<div class="result" class:show={status === 'done' && result !== null} bind:this={resultEl}>
		{#if result}
			<div class="stat">{formatSize(result.convertedBytes)}</div>
			<div class="stat-label">{fill(t.toolMp3.result.statLabel, { quality: result.quality })}</div>
			<p class="result-summary">
				{fill(t.toolMp3.result.summary, {
					duration: formatDuration(result.durationSec),
					from: formatSize(result.originalBytes)
				})}
			</p>

			<audio controls src={result.url}></audio>

			<div class="result-actions">
				<a href={result.url} download={result.fileName} class="download-btn">
					{t.toolMp3.result.download}
				</a>
				<button type="button" class="compress-new-btn" onclick={convertAnother}>
					{t.toolMp3.result.convertNew}
				</button>
			</div>

			<SupportLink />
		{/if}
	</div>

	<div class="privacy-note"><span class="dot"></span>{t.toolMp3.privacyNote}</div>
</div>

<ShareRow title={shareTitle} />

<hr class="content-divider" />

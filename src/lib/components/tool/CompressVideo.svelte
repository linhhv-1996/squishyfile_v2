<script lang="ts">
	// The tool UI only. Every bit of compression logic runs inside
	// compress.worker.ts — this component just reflects worker messages into
	// state and never does any processing itself.
	import { onDestroy, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { getStrings } from '$lib/i18n';
	import ShareRow from '$lib/components/share/ShareRow.svelte';
	import SupportLink from '$lib/components/support/SupportLink.svelte';
	import type { CompressionLevel, PlanWarning } from '$lib/compress/plan';
	import type { WorkerOutMessage } from './compress.worker';

	let {
		shareTitle = '',
		mode = 'default'
	}: { shareTitle?: string; mode?: 'default' | 'to-size' } = $props();

	const t = getStrings();

	const isSizeMode = $derived(mode === 'to-size');

	type Stage = 'probing' | 'loading-engine' | 'encoding';

	let file = $state<File | null>(null);
	let isDragging = $state(false);
	let level = $state<CompressionLevel>(2);
	let targetSize = $state<number | '' | null>('');
	let status = $state<'idle' | 'processing' | 'done' | 'error'>('idle');
	let progress = $state(0);
	let stage = $state<Stage>('probing');
	let pass = $state(1);
	let errorMessage = $state('');
	let fileInputEl = $state<HTMLInputElement>();
	let isSampleLoading = $state(false);
	let resultEl = $state<HTMLDivElement>();

	let result = $state<{
		url: string;
		fileName: string;
		originalBytes: number;
		compressedBytes: number;
		savedPercent: number;
		width: number;
		height: number;
		frameRate: number;
		targetMet: boolean | null;
		warnings: PlanWarning[];
	} | null>(null);

	let worker: Worker | undefined;

	// Created on first use, not on page load. The worker bundles the whole
	// Mediabunny demuxer/muxer set (~550 kB), and most visitors reading the
	// page below never touch the tool.
	function getWorker(): Worker | undefined {
		if (!browser) return undefined;
		if (worker) return worker;

		worker = new Worker(new URL('./compress.worker.ts', import.meta.url), {
			type: 'module'
		});
		worker.onerror = (event: ErrorEvent) => {
			// A crash the worker's own message handler never got to catch (e.g. a
			// module import that threw at load time) would otherwise disappear
			// silently and just leave the UI stuck.
			console.error('[CompressVideo] worker crashed:', event.message, event);
			status = 'error';
			errorMessage = t.tool.errors.generic;
		};
		worker.onmessageerror = (event: MessageEvent) => {
			console.error('[CompressVideo] worker message could not be deserialized:', event);
		};
		worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
			const data = event.data;

			if (data.type === 'progress') {
				progress = data.progress;
				stage = data.stage;
				pass = data.pass;
				return;
			}

			if (data.type === 'error') {
				console.error('[CompressVideo] worker reported an error:', data.message);
				status = 'error';
				errorMessage = t.tool.errors.generic;
				return;
			}

			// done
			progress = 100;
			revokeResult();
			result = {
				url: URL.createObjectURL(data.blob),
				fileName: data.fileName,
				originalBytes: data.originalBytes,
				compressedBytes: data.compressedBytes,
				savedPercent: data.savedPercent,
				width: data.width,
				height: data.height,
				frameRate: data.frameRate,
				targetMet: data.targetMet,
				warnings: data.warnings
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

	function fill(template: string, values: Record<string, string | number>) {
		return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
	}

	function reset() {
		status = 'idle';
		progress = 0;
		pass = 1;
		errorMessage = '';
		revokeResult();
	}

	function handleFile(next: File | null | undefined) {
		if (!next) return;
		file = next;
		reset();
		// The "compress to size" page treats target size as the primary
		// control (and hides compression level entirely), so pre-fill it at
		// 50% of the source file size the moment a file is picked, instead of
		// leaving it blank like the default/iPhone pages do.
		if (isSizeMode) {
			targetSize = Math.max(1, Math.round(next.size / (1024 * 1024) / 2));
		}
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

	// While a job is running the input file is locked: swapping or clearing it
	// mid-encode would leave the worker producing a result for a file the user
	// can no longer see. Cancel first, then change the file.
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
	// without requiring the isBusy guard (compression already finished).
	function compressAnother() {
		if (fileInputEl) fileInputEl.value = '';
		file = null;
		reset();
	}

	async function loadSample() {
		if (isBusy) return;
		isSampleLoading = true;
		try {
			const response = await fetch('/13069876_1280_720_30fps.mp4');
			if (!response.ok) throw new Error('sample fetch failed');
			const blob = await response.blob();
			handleFile(new File([blob], '13069876_1280_720_30fps.mp4', { type: 'video/mp4' }));
		} catch {
			status = 'error';
			errorMessage = t.tool.errors.generic;
		} finally {
			isSampleLoading = false;
		}
	}

	function startCompression() {
		const activeWorker = getWorker();
		if (!file || !activeWorker) return;
		reset();
		status = 'processing';
		stage = 'probing';
		activeWorker.postMessage({
			type: 'compress',
			file,
			level,
			targetSizeMB: hasTargetSize(targetSize) ? Number(targetSize) : null
		});
	}

	function cancelCompression() {
		worker?.postMessage({ type: 'cancel' });
		reset();
	}

	// Warn before wasting an encode: a target larger than the file itself
	// can't compress anything.
	// A target size takes over compression entirely — the level slider has no
	// effect while one is set, so it's disabled instead of silently ignored.
	// Note: clearing a <input type="number"> sets the bound value to `null`,
	// not `''` — both mean "no target size" and must be treated the same.
	function hasTargetSize(value: number | '' | null): value is number {
		return value !== '' && value !== null;
	}

	// A platform preset that's already at or above the source file's size is
	// just as pointless as a manually typed target above the file's size —
	// squishing to a target the file already meets does nothing, so the tag
	// is neither selectable nor shown as active.
	function presetPointless(mb: number) {
		return file !== null && mb * 1024 * 1024 >= file.size;
	}

	const targetSizeActive = $derived(hasTargetSize(targetSize));

	const targetIsPointless = $derived(
		file !== null && hasTargetSize(targetSize) && targetSize * 1024 * 1024 >= file.size
	);

	const progressLabel = $derived.by(() => {
		if (status === 'done') return t.tool.progress.done;
		if (stage === 'probing') return t.tool.progress.probing;
		if (stage === 'loading-engine') return t.tool.progress.loadingEngine;
		if (pass > 1) return fill(t.tool.progress.pass, { n: pass });
		return t.tool.progress.label;
	});

	function warningText(warning: PlanWarning) {
		const template = t.tool.warnings[warning];
		if (!template) return '';
		return fill(template, {
			width: result?.width ?? 0,
			height: result?.height ?? 0,
			fps: result?.frameRate ?? 0
		});
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
				{t.tool.dropzone.titlePrefix}
				<button type="button" disabled={isBusy} onclick={() => fileInputEl?.click()}>
					{t.tool.dropzone.browse}
				</button>
			</p>
			<p class="dz-sub">
				{t.tool.dropzone.subtitle}
				<button type="button" class="dz-sample" disabled={isBusy} onclick={loadSample}>
					{t.tool.dropzone.loadSample}
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
		<button class="remove" title={t.tool.fileInfo.remove} disabled={isBusy} onclick={removeFile}>
			✕
		</button>
	</div>

	<div class="controls" class:show={file !== null}>
		{#if !isSizeMode}
			<div class="field">
				<label for="quality">{t.tool.quality.label}</label>
				<input
					type="range"
					id="quality"
					min="1"
					max="3"
					step="1"
					disabled={isBusy || targetSizeActive}
					bind:value={level}
				/>
				<div class="quality-row">
					<span>{t.tool.quality.light}</span>
					<span>{t.tool.quality.max}</span>
				</div>
				<p class="hint">
					{#if targetSizeActive}
						{t.tool.quality.disabledByTarget}
					{:else}
						{t.tool.quality.levels[level - 1]}
					{/if}
				</p>
			</div>
		{/if}
		<div class="field">
			<label for="targetSize">
				{isSizeMode ? t.tool.targetSize.labelRequired : t.tool.targetSize.label}
			</label>
			<div class="size-input">
				<input
					type="number"
					id="targetSize"
					placeholder={t.tool.targetSize.placeholder}
					min="1"
					required={isSizeMode}
					disabled={isBusy}
					bind:value={targetSize}
				/>
				<span>{t.tool.targetSize.unit}</span>
			</div>
			<p class="hint">
				{#if targetIsPointless && file}
					{fill(t.tool.targetPreview, { size: formatSize(file.size) })}
				{:else if isSizeMode}
					{t.tool.targetSize.hintSizeMode}
				{:else}
					{t.tool.targetSize.hint}
				{/if}
			</p>
			{#if isSizeMode}
				<div class="platform-tags">
					{#each t.tool.targetSize.platforms as preset (preset.label)}
						<button
							type="button"
							class="platform-tag"
							class:active={targetSize === preset.mb && !presetPointless(preset.mb)}
							disabled={isBusy || presetPointless(preset.mb)}
							onclick={() => (targetSize = preset.mb)}
						>
							{preset.label} · {preset.mb}MB
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	{#if status === 'processing'}
		<button class="squish-btn is-processing" onclick={cancelCompression}>
			<span class="squish-btn-fill" style="width: {progress}%"></span>
			<span class="squish-btn-label">
				<span class="squish-btn-text">{progressLabel}</span>
				<span class="squish-btn-pct">{progress}% · {t.tool.button.cancel}</span>
			</span>
		</button>
	{:else}
		<button class="squish-btn" disabled={!file} onclick={startCompression}>
			<span class="squish-btn-idle">
				{t.tool.button.idle}
				<svg class="squish-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="m15 15 6 6m-6-6v4.8m0-4.8h4.8" />
					<path d="M9 19.8V15m0 0H4.2M9 15l-6 6" />
					<path d="M15 4.2V9m0 0h4.8M15 9l6-6" />
					<path d="M9 4.2V9m0 0H4.2M9 9 3 3" />
				</svg>
			</span>
		</button>
	{/if}

	{#if status === 'error'}
		<p class="tool-error">{errorMessage}</p>
	{/if}

	<div class="result" class:show={status === 'done' && result !== null} bind:this={resultEl}>
		{#if result}
			<div class="stat">-{result.savedPercent}%</div>
			<div class="stat-label">{t.tool.result.statLabel}</div>
			<p class="result-summary">
				{fill(t.tool.result.summary, {
					from: formatSize(result.originalBytes),
					to: formatSize(result.compressedBytes),
					width: result.width,
					height: result.height
				})}
			</p>

			{#if result.targetMet === false}
				<p class="result-note is-warn">
					{fill(t.tool.result.targetMissed, { target: targetSize ?? '' })}
				</p>
			{/if}
			{#each result.warnings as warning (warning)}
				<p class="result-note">{warningText(warning)}</p>
			{/each}

			<div class="result-actions">
				<a href={result.url} download={result.fileName} class="download-btn">
					{t.tool.result.download}
				</a>
				<button type="button" class="compress-new-btn" onclick={compressAnother}>
					{t.tool.result.compressNew}
				</button>
			</div>

			<SupportLink />
		{/if}
	</div>

	<div class="privacy-note"><span class="dot"></span>{t.tool.privacyNote}</div>
</div>

<ShareRow title={shareTitle} />

<hr class="content-divider" />

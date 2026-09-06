<script lang="ts">
	// The tool UI only. Every bit of transcription logic runs inside
	// video2text.worker.ts -- this component just reflects worker messages
	// into state. Structural twin of ConvertVideoToMp3.svelte, with a
	// transcript panel instead of an audio player as the result.
	import { onDestroy, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { getStrings } from '$lib/i18n';
	import ShareRow from '$lib/components/share/ShareRow.svelte';
	import SupportLink from '$lib/components/support/SupportLink.svelte';
	import type { WorkerOutMessage } from './video2text.worker';
	import { SUPPORTED_LANGUAGES } from '$lib/video2text/plan';

	let {
		shareTitle = '',
		samplePath = '/the_most_interesting_hack_in_history.mp4',
		sampleFileName = 'the_most_interesting_hack_in_history.mp4',
		sampleMimeType = 'video/mp4'
	}: {
		shareTitle?: string;
		samplePath?: string;
		sampleFileName?: string;
		sampleMimeType?: string;
	} = $props();

	const t = getStrings();

	type Stage = 'probing' | 'loading-model' | 'decoding-audio' | 'transcribing';

	let file = $state<File | null>(null);
	let isDragging = $state(false);
	let status = $state<'idle' | 'processing' | 'done' | 'error'>('idle');
	let progress = $state(0);
	let stage = $state<Stage>('probing');
	let errorMessage = $state('');
	let fileInputEl = $state<HTMLInputElement>();
	let isSampleLoading = $state(false);
	let resultEl = $state<HTMLDivElement>();
	let copied = $state(false);

	let result = $state<{
		text: string;
		segments: { text: string; startSec: number }[];
		durationSec: number;
	} | null>(null);
	let showTimestamps = $state(false);

	let worker: Worker | undefined;

	// Created on first use, not on page load -- the worker bundles Mediabunny
	// and onnxruntime-web, and most visitors reading the page below never
	// touch the tool.
	function getWorker(): Worker | undefined {
		if (!browser) return undefined;
		if (worker) return worker;

		worker = new Worker(new URL('./video2text.worker.ts', import.meta.url), {
			type: 'module'
		});
		worker.onerror = (event: ErrorEvent) => {
			console.error('[VideoToText] worker crashed:', event.message, event);
			status = 'error';
			errorMessage = t.toolVideoToText.errors.generic;
		};
		worker.onmessageerror = (event: MessageEvent) => {
			console.error('[VideoToText] worker message could not be deserialized:', event);
		};
		worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
			const data = event.data;

			if (data.type === 'progress') {
				progress = data.progress;
				stage = data.stage;
				return;
			}

			if (data.type === 'error') {
				console.error('[VideoToText] worker reported an error:', data.message);
				status = 'error';
				errorMessage =
					data.code === 'no_audio' ? t.toolVideoToText.errors.noAudio : t.toolVideoToText.errors.generic;
				return;
			}

			// done
			progress = 100;
			result = { text: data.text, segments: data.segments, durationSec: data.durationSec };
			status = 'done';
			tick().then(() => resultEl?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
		};

		return worker;
	}

	onDestroy(() => {
		worker?.terminate();
	});

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
		copied = false;
		result = null;
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

	function transcribeAnother() {
		if (fileInputEl) fileInputEl.value = '';
		file = null;
		reset();
	}

	async function loadSample() {
		if (isBusy) return;
		isSampleLoading = true;
		try {
			const response = await fetch(samplePath);
			if (!response.ok) throw new Error('sample fetch failed');
			const blob = await response.blob();
			handleFile(new File([blob], sampleFileName, { type: sampleMimeType }));
		} catch {
			status = 'error';
			errorMessage = t.toolVideoToText.errors.generic;
		} finally {
			isSampleLoading = false;
		}
	}

	function startTranscription() {
		const activeWorker = getWorker();
		if (!file || !activeWorker) return;
		reset();
		status = 'processing';
		stage = 'probing';
		activeWorker.postMessage({ type: 'transcribe', file });
	}

	function cancelTranscription() {
		worker?.postMessage({ type: 'cancel' });
		reset();
	}

	async function copyText() {
		if (!result) return;
		try {
			await navigator.clipboard.writeText(showTimestamps ? timestampedText() : result.text);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch (err) {
			console.error('[VideoToText] copy failed:', err);
		}
	}

	function formatTimestamp(totalSeconds: number) {
		const s = Math.max(0, Math.floor(totalSeconds));
		const m = Math.floor(s / 60);
		const rem = s % 60;
		return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
	}

	function timestampedText(): string {
		if (!result) return '';
		return result.segments.map((seg) => `[${formatTimestamp(seg.startSec)}] ${seg.text}`).join('\n');
	}

	function downloadUrl(): string {
		if (!result) return '';
		const content = showTimestamps ? timestampedText() : result.text;
		return URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
	}

	const progressLabel = $derived.by(() => {
		if (status === 'done') return t.toolVideoToText.progress.done;
		if (stage === 'probing') return t.toolVideoToText.progress.probing;
		if (stage === 'loading-model') return t.toolVideoToText.progress.loadingModel;
		if (stage === 'decoding-audio') return t.toolVideoToText.progress.decodingAudio;
		return t.toolVideoToText.progress.transcribing;
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
				{t.toolVideoToText.dropzone.titlePrefix}
				<button type="button" disabled={isBusy} onclick={() => fileInputEl?.click()}>
					{t.toolVideoToText.dropzone.browse}
				</button>
			</p>
			<p class="dz-sub">
				{t.toolVideoToText.dropzone.subtitle}
				<button type="button" class="dz-sample" disabled={isBusy} onclick={loadSample}>
					{t.toolVideoToText.dropzone.loadSample}
				</button>
			</p>
			<p class="dz-langs">
				{t.toolVideoToText.languages.label}
				{SUPPORTED_LANGUAGES.map((lang) => lang.name).join(', ')}
			</p>
		</div>
		<input
			bind:this={fileInputEl}
			type="file"
			accept="video/*,audio/*"
			disabled={isBusy}
			onchange={onFileInputChange}
		/>
	</div>

	<div class="file-info" class:show={file !== null}>
		<span class="fname">{file?.name ?? ''}</span>
		<button class="remove" title={t.toolVideoToText.fileInfo.remove} disabled={isBusy} onclick={removeFile}>
			✕
		</button>
	</div>

	{#if status === 'processing'}
		<button class="squish-btn is-processing" onclick={cancelTranscription}>
			<span class="squish-btn-fill" style="width: {progress}%"></span>
			<span class="squish-btn-label">
				<span class="squish-btn-text">{progressLabel}</span>
				<span class="squish-btn-pct">{progress}% · {t.toolVideoToText.button.cancel}</span>
			</span>
		</button>
	{:else}
		<button class="squish-btn" disabled={!file} onclick={startTranscription}>
			{t.toolVideoToText.button.idle}
		</button>
	{/if}

	{#if status === 'error'}
		<p class="tool-error">{errorMessage}</p>
	{/if}

	<div class="result transcript-result" class:show={status === 'done' && result !== null} bind:this={resultEl}>
		{#if result}
			<p class="result-summary">{fill(t.toolVideoToText.result.summary, { duration: formatDuration(result.durationSec) })}</p>

			<label class="timestamps-toggle">
				<input type="checkbox" bind:checked={showTimestamps} />
				{t.toolVideoToText.result.showTimestamps}
			</label>

			{#if showTimestamps}
				<div class="transcript-text transcript-segments" role="textbox" aria-readonly="true" tabindex="0">
					{#each result.segments as seg (seg.startSec)}
						<p class="segment-line">
							<span class="segment-time">{formatTimestamp(seg.startSec)}</span>{seg.text}
						</p>
					{/each}
				</div>
			{:else}
				<textarea class="transcript-text" readonly value={result.text}></textarea>
			{/if}

			<div class="result-actions">
				<button type="button" class="download-btn" onclick={copyText}>
					{copied ? t.toolVideoToText.result.copied : t.toolVideoToText.result.copy}
				</button>
				<a href={downloadUrl()} download="transcript.txt" class="download-btn">
					{t.toolVideoToText.result.download}
				</a>
				<button type="button" class="compress-new-btn" onclick={transcribeAnother}>
					{t.toolVideoToText.result.transcribeNew}
				</button>
			</div>

			<SupportLink />
		{/if}
	</div>

	<div class="privacy-note"><span class="dot"></span>{t.toolVideoToText.privacyNote}</div>
</div>

<ShareRow title={shareTitle} />

<hr class="content-divider" />

<style>
	/* .download-btn is styled globally for the <a> download link elsewhere in
	   the app -- it never needed its own border/cursor reset because anchors
	   don't have a default button chrome. The "Copy text" button above reuses
	   the same class for a matching look, but as a real <button> it inherits
	   the browser's default button border and cursor, which clashed with the
	   pill shape (that's the stray ring/no-pointer-cursor bug). */
	button.download-btn {
		border: none;
		cursor: pointer;
		font-family: inherit;
		appearance: none;
	}

	.dz-langs {
		margin: 4px 0 0;
		font-size: 12.5px;
		color: var(--muted);
	}

	.timestamps-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 12px;
		font-size: 13px;
		color: var(--muted);
		cursor: pointer;
	}

	.transcript-text {
		width: 100%;
		min-height: 180px;
		margin-top: 10px;
		padding: 12px 14px;
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		font-family: inherit;
		font-size: 14px;
		line-height: 1.5;
		color: var(--ink);
		background: #fff;
		resize: vertical;
	}

	.transcript-segments {
		overflow-y: auto;
		text-align: left;
		resize: none;
	}

	.segment-line {
		margin: 0 0 8px;
	}

	.segment-time {
		display: inline-block;
		min-width: 44px;
		margin-right: 8px;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		color: var(--teal);
	}
</style>

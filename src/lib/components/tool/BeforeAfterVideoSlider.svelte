<script lang="ts">
	// Reusable before/after video comparison modal: two <video> elements
	// stacked in the same box, the top one clipped by a draggable vertical
	// divider (classic image-compare-slider pattern, adapted for two videos
	// that need to stay in sync). Self-contained -- no modal precedent
	// existed elsewhere in the app to follow, so this owns its own overlay,
	// focus-trap-free close handling (Escape / backdrop click), and styles.
	//
	// Takes plain URLs rather than File objects so it can be reused by any
	// future before/after tool (e.g. an image upscaler) without depending on
	// this tool's worker message shapes.
	let {
		open = $bindable(false),
		beforeUrl,
		afterUrl,
		beforeLabel = 'Original',
		afterLabel = 'Upscaled'
	}: {
		open?: boolean;
		beforeUrl: string;
		afterUrl: string;
		beforeLabel?: string;
		afterLabel?: string;
	} = $props();

	let beforeEl = $state<HTMLVideoElement>();
	let afterEl = $state<HTMLVideoElement>();
	let trackEl = $state<HTMLDivElement>();

	// 0-100, percent of the box width where the divider sits. The "after"
	// (upscaled) video is the top layer and gets clipped from the left up to
	// this point, revealing the "before" video underneath on the left side.
	let splitPercent = $state(50);
	let isDragging = $state(false);

	// Tags stay put in their box corners -- only their own video's visible
	// region decides whether they're shown. Once that region shrinks past
	// ~10% of the width there's no video left under the tag to label, so
	// it fades out instead of sitting on top of the other side's video.
	const TAG_HIDE_THRESHOLD = 30;
	const showBeforeTag = $derived(splitPercent > TAG_HIDE_THRESHOLD);
	const showAfterTag = $derived(100 - splitPercent > TAG_HIDE_THRESHOLD);

	let isPlaying = $state(false);
	let duration = $state(0);
	let currentTime = $state(0);

	// The "before" video is the sync master: its own timeline drives the
	// seek bar and every play/pause/seek gesture, and "after" is kept
	// matched to it. Muting "after" avoids the phasing/echo you'd get
	// playing the same audio twice a few frames out of alignment -- the
	// viewer only ever hears one audio track.
	function syncAfterToMaster() {
		if (!beforeEl || !afterEl) return;
		if (Math.abs(afterEl.currentTime - beforeEl.currentTime) > 0.15) {
			afterEl.currentTime = beforeEl.currentTime;
		}
	}

	function onMasterTimeUpdate() {
		if (!beforeEl) return;
		currentTime = beforeEl.currentTime;
		syncAfterToMaster();
	}

	function onMasterSeeked() {
		syncAfterToMaster();
	}

	function onMasterLoadedMetadata() {
		if (beforeEl) duration = beforeEl.duration || 0;
	}

	function togglePlay() {
		if (!beforeEl || !afterEl) return;
		if (beforeEl.paused) {
			syncAfterToMaster();
			beforeEl.play();
			afterEl.play();
		} else {
			beforeEl.pause();
			afterEl.pause();
		}
	}

	function onSeekInput(event: Event) {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		currentTime = value;
		if (beforeEl) beforeEl.currentTime = value;
		syncAfterToMaster();
	}

	function updateSplitFromClientX(clientX: number) {
		if (!trackEl) return;
		const rect = trackEl.getBoundingClientRect();
		const fraction = (clientX - rect.left) / rect.width;
		splitPercent = Math.min(100, Math.max(0, fraction * 100));
	}

	// Pointer Events cover mouse, touch and pen with one code path. Pointer
	// capture on the handle means move/up events keep reaching it even once
	// the pointer strays outside the handle -- necessary since dragging fast
	// easily overshoots a 40px knob.
	function onHandlePointerDown(event: PointerEvent) {
		isDragging = true;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		updateSplitFromClientX(event.clientX);
	}

	function onHandlePointerMove(event: PointerEvent) {
		if (!isDragging) return;
		updateSplitFromClientX(event.clientX);
	}

	function onHandlePointerUp(event: PointerEvent) {
		isDragging = false;
		(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
	}

	function close() {
		beforeEl?.pause();
		afterEl?.pause();
		open = false;
	}

	function onBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) close();
	}

	function onWindowKeydown(event: KeyboardEvent) {
		if (!open) return;
		if (event.key === 'Escape') close();
	}

	function formatTime(totalSeconds: number) {
		const s = Math.max(0, Math.round(totalSeconds));
		const m = Math.floor(s / 60);
		const rem = s % 60;
		return `${m}:${String(rem).padStart(2, '0')}`;
	}

	// Reset playback state whenever the modal is (re)opened on a fresh pair
	// of sources, so a second "View Result" open doesn't resume mid-clip.
	$effect(() => {
		if (open) {
			splitPercent = 50;
			isPlaying = false;
			currentTime = 0;
		}
	});
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
	<div class="bavs-backdrop" onclick={onBackdropClick} role="presentation">
		<div class="bavs-modal" role="dialog" aria-modal="true" aria-label="Before and after comparison">
			<button type="button" class="bavs-close" onclick={close} aria-label="Close">✕</button>

			<div class="bavs-stage" bind:this={trackEl}>
				<!-- svelte-ignore a11y_media_has_caption -- user-uploaded video, no caption track exists -->
				<video
					bind:this={beforeEl}
					src={beforeUrl}
					class="bavs-video bavs-before"
					playsinline
					onloadedmetadata={onMasterLoadedMetadata}
					ontimeupdate={onMasterTimeUpdate}
					onseeked={onMasterSeeked}
					onplay={() => (isPlaying = true)}
					onpause={() => (isPlaying = false)}
				></video>
				<!-- svelte-ignore a11y_media_has_caption -- same source, no caption track -->
				<video
					bind:this={afterEl}
					src={afterUrl}
					class="bavs-video bavs-after"
					playsinline
					muted
					style="clip-path: inset(0 0 0 {splitPercent}%)"
				></video>

				<span class="bavs-tag bavs-tag-left" class:bavs-tag-hidden={!showBeforeTag}>{beforeLabel}</span>
				<span class="bavs-tag bavs-tag-right" class:bavs-tag-hidden={!showAfterTag}>{afterLabel}</span>

				<div class="bavs-divider" style="left: {splitPercent}%"></div>
				<div
					class="bavs-handle"
					style="left: {splitPercent}%"
					role="slider"
					aria-label="Comparison slider"
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={Math.round(splitPercent)}
					tabindex="0"
					onpointerdown={onHandlePointerDown}
					onpointermove={onHandlePointerMove}
					onpointerup={onHandlePointerUp}
					onpointercancel={onHandlePointerUp}
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="m9 6-6 6 6 6" />
						<path d="m15 6 6 6-6 6" />
					</svg>
				</div>
			</div>

			<div class="bavs-controls">
				<button type="button" class="bavs-play" onclick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
					{#if isPlaying}
						<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<rect x="6" y="5" width="4" height="14" rx="1" />
							<rect x="14" y="5" width="4" height="14" rx="1" />
						</svg>
					{:else}
						<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<path d="M7 5.5v13a1 1 0 0 0 1.53.85l10.4-6.5a1 1 0 0 0 0-1.7l-10.4-6.5A1 1 0 0 0 7 5.5Z" />
						</svg>
					{/if}
				</button>
				<span class="bavs-time">{formatTime(currentTime)}</span>
				<input
					type="range"
					class="bavs-seek"
					min="0"
					max={duration || 0}
					step="0.01"
					value={currentTime}
					oninput={onSeekInput}
					aria-label="Seek"
				/>
				<span class="bavs-time">{formatTime(duration)}</span>
			</div>
		</div>
	</div>
{/if}

<style>
	.bavs-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.72);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 16px;
	}

	.bavs-modal {
		position: relative;
		width: min(960px, 100%);
		background: #14161c;
		border-radius: 16px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}

	.bavs-close {
		position: absolute;
		top: 10px;
		right: 10px;
		width: 32px;
		height: 32px;
		border-radius: 999px;
		border: none;
		background: rgba(255, 255, 255, 0.12);
		color: #fff;
		font-size: 15px;
		cursor: pointer;
		z-index: 2;
	}
	.bavs-close:hover {
		background: rgba(255, 255, 255, 0.22);
	}

	.bavs-stage {
		position: relative;
		width: 100%;
		aspect-ratio: 16 / 9;
		background: #000;
		border-radius: 10px;
		overflow: hidden;
		touch-action: none;
		user-select: none;
	}

	.bavs-video {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
		background: #000;
	}
	.bavs-after {
		will-change: clip-path;
	}

	.bavs-tag {
		position: absolute;
		top: 10px;
		padding: 4px 10px;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.55);
		color: #fff;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.02em;
		white-space: nowrap;
		pointer-events: none;
		opacity: 1;
		transition: opacity 0.15s ease;
	}
	.bavs-tag-left {
		left: 10px;
	}
	.bavs-tag-right {
		right: 10px;
	}
	.bavs-tag-hidden {
		opacity: 0;
	}

	.bavs-divider {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		background: rgba(255, 255, 255, 0.85);
		transform: translateX(-1px);
		pointer-events: none;
	}

	.bavs-handle {
		position: absolute;
		top: 50%;
		width: 40px;
		height: 40px;
		border-radius: 999px;
		background: #fff;
		color: #14161c;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1px;
		transform: translate(-50%, -50%);
		cursor: ew-resize;
		touch-action: none;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
	}
	.bavs-handle svg {
		width: 18px;
		height: 18px;
	}

	.bavs-controls {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.bavs-play {
		flex: 0 0 auto;
		width: 36px;
		height: 36px;
		border-radius: 999px;
		border: none;
		background: var(--coral);
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.bavs-play svg {
		width: 18px;
		height: 18px;
	}

	.bavs-time {
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		color: #9a9ba3;
		flex: 0 0 auto;
	}

	.bavs-seek {
		flex: 1 1 auto;
		accent-color: var(--coral);
	}
</style>

<script lang="ts">
	// Small corner toast nudging people to bookmark the site once they've
	// actually stuck around (not on first paint — that reads as a popup ad).
	// Shows the OS-appropriate keyboard shortcut instead of trying to
	// trigger window.external.AddFavorite / sidebar APIs, which browsers
	// don't expose to page scripts anymore. Dismiss is remembered so it
	// doesn't nag on every visit.
	import { getStrings } from '$lib/i18n';

	const t = getStrings();

	const STORAGE_KEY = 'sf_bookmark_toast_dismissed_at';
	const COOLDOWN_DAYS = 21;
	const SHOW_AFTER_MS = 20000; // let them actually use the tool first
	const AUTO_HIDE_MS = 12000;

	let visible = $state(false);
	let shortcut = $state('Ctrl + D');
	let hideTimer: ReturnType<typeof setTimeout> | undefined;

	function withinCooldown(): boolean {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return false;
		const last = Number(raw);
		if (Number.isNaN(last)) return false;
		const days = (Date.now() - last) / (1000 * 60 * 60 * 24);
		return days < COOLDOWN_DAYS;
	}

	function scheduleAutoHide() {
		clearTimeout(hideTimer);
		hideTimer = setTimeout(() => (visible = false), AUTO_HIDE_MS);
	}

	function dismiss() {
		visible = false;
		clearTimeout(hideTimer);
		try {
			localStorage.setItem(STORAGE_KEY, String(Date.now()));
		} catch {
			// localStorage can throw in private mode / disabled storage — fine to ignore
		}
	}

	$effect(() => {
		if (typeof window === 'undefined') return;

		// No physical keyboard on phones/tablets — "press Ctrl+D" means
		// nothing there, so just don't show this toast at all on touch/narrow
		// viewports rather than showing bad advice.
		const isMobile =
			window.matchMedia('(max-width: 480px)').matches ||
			window.matchMedia('(pointer: coarse)').matches;
		if (isMobile) return;

		shortcut = /Mac/.test(navigator.platform ?? navigator.userAgent) ? 'Command + D' : 'Ctrl + D';

		let cooled = false;
		try {
			cooled = withinCooldown();
		} catch {
			cooled = false;
		}
		if (cooled) return;

		const showTimer = setTimeout(() => {
			visible = true;
			scheduleAutoHide();
		}, SHOW_AFTER_MS);

		return () => {
			clearTimeout(showTimer);
			clearTimeout(hideTimer);
		};
	});
</script>

{#if visible}
	<div
		class="bookmark-toast"
		role="status"
		onmouseenter={() => clearTimeout(hideTimer)}
		onmouseleave={scheduleAutoHide}
	>
		<span class="kbd">{shortcut}</span>
		<p>{t.bookmarkToast.message}</p>
		<button class="close" aria-label={t.bookmarkToast.dismiss} onclick={dismiss}>✕</button>
	</div>
{/if}

<style>
	.bookmark-toast {
		position: fixed;
		right: 20px;
		bottom: 20px;
		z-index: 40;
		display: flex;
		align-items: center;
		gap: 10px;
		/* max-width: 340px; */
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		box-shadow: 0 14px 34px rgba(31, 42, 36, 0.22);
		padding: 12px 14px;
		animation: bookmark-toast-in 0.25s ease-out;
	}
	.kbd {
		flex-shrink: 0;
		font-family: 'Baloo 2', sans-serif;
		font-weight: 700;
		font-size: 15px;
		white-space: nowrap;
		color: var(--ink);
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		padding: 8px 12px;
		box-shadow: 0 2px 0 var(--line);
	}
	.bookmark-toast p {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		color: var(--ink);
		line-height: 1.4;
	}
	.close {
		flex-shrink: 0;
		margin-left: auto;
		border: none;
		background: none;
		color: var(--muted);
		font-size: 14px;
		line-height: 1;
		cursor: pointer;
		padding: 4px;
	}
	.close:hover {
		color: var(--ink);
	}
	@keyframes bookmark-toast-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>

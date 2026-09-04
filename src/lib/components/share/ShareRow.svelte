<script lang="ts">
	// Self-contained "share this page" row: real share links for the popular
	// platforms (Facebook, X, Telegram) plus copy-link. Hrefs are always the
	// real share URLs (so it degrades gracefully with JS off / middle-click /
	// open-in-new-tab); the click handler just upgrades that into a small
	// popup window instead of a full navigation.
	import { page } from '$app/state';
	import { getStrings } from '$lib/i18n';

	let { title = '' }: { title?: string } = $props();

	const t = getStrings();

	let copied = $state(false);

	let pageUrl = $derived(page.url.href);
	let facebookUrl = $derived(
		`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`
	);
	let twitterUrl = $derived(
		`https://twitter.com/intent/tweet?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(title)}`
	);
	let telegramUrl = $derived(
		`https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(title)}`
	);

	function openSharePopup(event: MouseEvent, url: string) {
		event.preventDefault();
		window.open(url, 'share', 'noopener,noreferrer,width=600,height=520');
	}

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(pageUrl);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			// Clipboard access can be denied by the browser — nothing to recover,
			// the link simply doesn't get copied.
		}
	}
</script>

<div class="share">
	<span class="label">{t.share.label}</span>
	<a
		href={facebookUrl}
		title={t.share.facebook}
		aria-label={t.share.facebook}
		target="_blank"
		rel="noopener noreferrer"
		onclick={(event) => openSharePopup(event, facebookUrl)}
	>
		<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
			<path
				d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06C2 17.08 5.66 21.22 10.44 22v-7.03H7.9v-2.91h2.54V9.85c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.91h-2.33V22C18.34 21.22 22 17.08 22 12.06Z"
			/>
		</svg>
	</a>
	<a
		href={twitterUrl}
		title={t.share.twitter}
		aria-label={t.share.twitter}
		target="_blank"
		rel="noopener noreferrer"
		onclick={(event) => openSharePopup(event, twitterUrl)}
	>
		<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
			<path
				d="M18.24 2.75h3.05l-6.66 7.62 7.84 10.88h-6.13l-4.8-6.72-5.49 6.72H2.99l7.13-8.72L2.6 2.75h6.28l4.34 6.14 5.02-6.14Zm-1.07 16.66h1.69L7.03 4.44H5.2l11.97 14.97Z"
			/>
		</svg>
	</a>
	<a
		href={telegramUrl}
		title={t.share.telegram}
		aria-label={t.share.telegram}
		target="_blank"
		rel="noopener noreferrer"
		onclick={(event) => openSharePopup(event, telegramUrl)}
	>
		<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
			<path
				d="M21.05 3.16 2.87 10.3c-1.24.5-1.23 1.19-.23 1.5l4.67 1.46 1.8 5.6c.22.6.11.85.75.85.5 0 .72-.23 1-.5l2.4-2.33 4.72 3.48c.87.48 1.5.23 1.72-.8l3.12-14.7c.31-1.26-.48-1.83-1.77-1.7Zm-3.2 3.6-8.02 7.28-.32 3.4-1.6-5.1 9.4-6.03c.44-.27.85-.12.54.16Z"
			/>
		</svg>
	</a>
	<button type="button" title={copied ? t.share.copied : t.share.copyLink} onclick={copyLink}>
		{#if copied}
			<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M20 6 9 17l-5-5" />
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.5" />
				<path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.34-1.34" />
			</svg>
		{/if}
	</button>
</div>

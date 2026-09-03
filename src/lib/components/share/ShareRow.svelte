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
		target="_blank"
		rel="noopener noreferrer"
		onclick={(event) => openSharePopup(event, facebookUrl)}
	>
		📘
	</a>
	<a
		href={twitterUrl}
		title={t.share.twitter}
		target="_blank"
		rel="noopener noreferrer"
		onclick={(event) => openSharePopup(event, twitterUrl)}
	>
		𝕏
	</a>
	<a
		href={telegramUrl}
		title={t.share.telegram}
		target="_blank"
		rel="noopener noreferrer"
		onclick={(event) => openSharePopup(event, telegramUrl)}
	>
		✈️
	</a>
	<button type="button" title={copied ? t.share.copied : t.share.copyLink} onclick={copyLink}>
		{copied ? '✅' : '🔗'}
	</button>
</div>

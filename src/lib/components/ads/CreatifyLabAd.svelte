<script lang="ts">
	// Affiliate house ad filling the reserved 300x250 slot until a real ad
	// network is wired up. Creatify affiliate — swap the href/copy/image here
	// without touching call sites (same slot contract as Ads300x250).
	//
	// Rendered client-side only (after mount): the affiliate link/creative
	// never lands in the server-rendered HTML, so it can't dilute the page's
	// crawled content or add to the initial payload — good for SEO and for
	// keeping this out of LCP/render-blocking work. A same-size placeholder
	// is shown until then so the hero layout never shifts (CLS-safe).
	import { onMount } from 'svelte';
	import { getStrings } from '$lib/i18n';

	const t = getStrings();
	const copy = t.ads.creatifyLab;

	const AFFILIATE_URL = 'https://creatify.ai/?via=squishyfilecom';

	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
</script>

{#if mounted}
	<a
		class="creatify-ad"
		href={AFFILIATE_URL}
		target="_blank"
		rel="sponsored nofollow noopener"
		aria-label="{copy.headline} — {copy.cta} (opens Creatify in a new tab)"
	>
		<span class="ad-label">{copy.label}</span>
		<img
			class="logo"
			src="/creatify_lab.avif"
			alt=""
			width="64"
			height="64"
			loading="lazy"
			decoding="async"
		/>
		<span class="headline">{copy.headline}</span>
		<span class="subtitle">{copy.subtitle}</span>
		<span class="cta">{copy.cta} →</span>
	</a>
{:else}
	<div class="creatify-ad creatify-ad--placeholder" aria-hidden="true"></div>
{/if}

<style>
	.creatify-ad {
		flex-shrink: 0;
		width: 300px;
		height: 250px;
		box-sizing: border-box;
		border-radius: var(--radius-sm, 10px);
		border: 1px solid var(--line, #E1EAE4);
		background: var(--bg, #F5F9F6);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 18px 20px;
		text-align: center;
		text-decoration: none;
		position: relative;
		transition: filter 0.15s ease;
	}
	.creatify-ad:hover,
	.creatify-ad:focus-visible {
		border-color: #C7D4CD;
	}
	.creatify-ad--placeholder {
		background: var(--bg, #F5F9F6);
	}

	.ad-label {
		position: absolute;
		top: 8px;
		left: 10px;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: rgba(0, 0, 0, 0.35);
	}

	.logo {
		width: 128px;
		/* height: 56px; */
		border-radius: 14px;
		object-fit: cover;
		margin-bottom: 4px;
		/* creatify_lab.avif ships on a white square background; multiply
		   drops the white pixels onto the card's own background so no
		   white box shows, as long as the card stays light. */
		mix-blend-mode: multiply;
	}

	.headline {
		font-family: 'Baloo 2', sans-serif;
		font-weight: 600;
		font-size: 15.5px;
		line-height: 1.25;
		color: var(--ink, #1F2A24);
	}

	.subtitle {
		font-size: 12.5px;
		line-height: 1.4;
		color: var(--muted, #4A5750);
		max-width: 220px;
	}

	.cta {
		margin-top: 8px;
		font-size: 12.5px;
		font-weight: 600;
		color: var(--muted, #4A5750);
		background: #fff;
		border: 1.5px solid var(--line, #E1EAE4);
		padding: 7px 16px;
		border-radius: 999px;
	}

	@media (max-width: 760px) {
		.creatify-ad {
			display: none;
		}
	}
</style>

<script lang="ts">
	// Affiliate house ad filling the reserved 300x250 slot until a real ad
	// network is wired up. NordVPN affiliate — swap the href/copy/image here
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
	const copy = t.ads.nordVpn;

	const AFFILIATE_URL = 'https://go.nordvpn.net/aff_c?offer_id=15&aff_id=151851';

	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
</script>

{#if mounted}
	<a
		class="nordvpn-ad"
		href={AFFILIATE_URL}
		target="_blank"
		rel="sponsored nofollow noopener"
		aria-label="{copy.headline} — {copy.cta} (opens NordVPN in a new tab)"
	>
		<span class="ad-label">{copy.label}</span>
		<img
			class="logo"
			src="/nord_vpn.jpg"
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
	<div class="nordvpn-ad nordvpn-ad--placeholder" aria-hidden="true"></div>
{/if}

<style>
	.nordvpn-ad {
		flex-shrink: 0;
		width: 300px;
		height: 250px;
		box-sizing: border-box;
		border-radius: var(--radius-sm, 10px);
		border: 1.5px solid #E4DFCF;
		background: linear-gradient(180deg, #223349 0%, #1D4E80 100%);
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
	.nordvpn-ad:hover,
	.nordvpn-ad:focus-visible {
		filter: brightness(1.08);
	}
	.nordvpn-ad--placeholder {
		background: linear-gradient(180deg, #223349 0%, #1D4E80 100%);
	}

	.ad-label {
		position: absolute;
		top: 8px;
		left: 10px;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.45);
	}

	.logo {
		width: 56px;
		height: 56px;
		border-radius: 14px;
		object-fit: cover;
		margin-bottom: 4px;
	}

	.headline {
		font-family: 'Baloo 2', sans-serif;
		font-weight: 700;
		font-size: 17px;
		line-height: 1.25;
		color: #fff;
	}

	.subtitle {
		font-size: 12.5px;
		line-height: 1.4;
		color: rgba(255, 255, 255, 0.7);
		max-width: 220px;
	}

	.cta {
		margin-top: 8px;
		font-size: 13px;
		font-weight: 700;
		color: #06254A;
		background: #fff;
		padding: 8px 18px;
		border-radius: 999px;
	}

	@media (max-width: 760px) {
		.nordvpn-ad {
			display: none;
		}
	}
</style>

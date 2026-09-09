<script lang="ts">
	// Generic sponsor-ad slot for the hero 300x250 spot. Which offer(s) show
	// on each route -- and whether it's a fixed target or a rotation across
	// several -- is entirely controlled by src/lib/config/offers.json (see
	// $lib/utils/offers.ts); this component has zero route-specific logic,
	// just render + tracking. Replaces the old per-brand CreatifyLabAd /
	// NordVpnAd components (kept on disk, unused, in case of rollback).
	//
	// Rendered client-side only (after mount), same contract as before: the
	// affiliate link/creative never lands in the server-rendered HTML (can't
	// dilute crawled content, stays off LCP/render-blocking work). A
	// same-size placeholder holds the hero layout so there's no CLS.
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { pickOffer } from '$lib/utils/offers';
	import { trackEvent } from '$lib/analytics';

	// Picked once when this component is created -- i.e. once per page
	// load/navigation -- so a "rotate" placement doesn't re-roll on every
	// rerender of the hero section.
	const picked = pickOffer(page.url.pathname);

	let mounted = $state(false);
	let adEl = $state<HTMLAnchorElement>();

	onMount(() => {
		mounted = true;
		if (!picked || !adEl) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					trackEvent('ad_impression', { ad_id: picked.id });
					observer.disconnect();
				}
			},
			{ threshold: 0.5 }
		);
		observer.observe(adEl);
		return () => observer.disconnect();
	});

	function onClick() {
		if (picked) trackEvent('ad_click', { ad_id: picked.id });
	}
</script>

{#if picked}
	{#if mounted}
		<a
			bind:this={adEl}
			class="offer-ad"
			class:offer-ad--dark={picked.offer.theme === 'dark'}
			style:--accent-from={picked.offer.accentFrom}
			style:--accent-to={picked.offer.accentTo}
			href={picked.offer.url}
			target="_blank"
			rel="sponsored nofollow noopener"
			onclick={onClick}
			aria-label="{picked.offer.headline} — {picked.offer.cta} (opens in a new tab)"
		>
			<span class="ad-label">{picked.offer.label}</span>
			{#if picked.offer.logo}
				<img
					class="logo"
					src={picked.offer.logo}
					alt=""
					width="64"
					height="auto"
					loading="lazy"
					decoding="async"
				/>
			{/if}
			<span class="headline">{picked.offer.headline}</span>
			<span class="subtitle">{picked.offer.subtitle}</span>
			<span class="cta">{picked.offer.cta} →</span>
		</a>
	{:else}
		<div class="offer-ad offer-ad--placeholder" aria-hidden="true"></div>
	{/if}
{/if}

<style>
	.offer-ad {
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
		transition: filter 0.15s ease, border-color 0.15s ease;
	}
	.offer-ad:hover,
	.offer-ad:focus-visible {
		border-color: #C7D4CD;
	}
	.offer-ad--placeholder {
		background: var(--bg, #F5F9F6);
	}

	.offer-ad--dark {
		border: 1.5px solid #E4DFCF;
		background: linear-gradient(180deg, var(--accent-from, #223349) 0%, var(--accent-to, #1D4E80) 100%);
	}
	.offer-ad--dark:hover,
	.offer-ad--dark:focus-visible {
		filter: brightness(1.08);
		border-color: #E4DFCF;
	}
	.offer-ad--dark .headline {
		color: #fff;
	}
	.offer-ad--dark .subtitle {
		color: rgba(255, 255, 255, 0.7);
	}
	.offer-ad--dark .ad-label {
		color: rgba(255, 255, 255, 0.45);
	}
	.offer-ad--dark .cta {
		color: #06254A;
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
		width: 64px;
		height: auto;
		border-radius: 0px;
		object-fit: cover;
		margin-bottom: 4px;
		/* Logos that ship on a white square background (like creatify_lab's)
		   need multiply so the white pixels drop onto the card's own
		   background -- only correct on the light theme. */
		mix-blend-mode: multiply;
	}
	.offer-ad--dark .logo {
		mix-blend-mode: normal;
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
		.offer-ad {
			display: none;
		}
	}
</style>

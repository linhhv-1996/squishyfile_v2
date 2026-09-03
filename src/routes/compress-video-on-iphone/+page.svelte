<script lang="ts">
	import { getStrings } from '$lib/i18n';
	import Ads300x250 from '$lib/components/ads/Ads300x250.svelte';
	import CompressVideo from '$lib/components/tool/CompressVideo.svelte';

	let { data } = $props();
	const t = getStrings();
	const copy = t.pages.compressOnIphone;
</script>

<svelte:head>
	<title>{copy.meta.title}</title>
	<meta name="description" content={copy.meta.description} />
</svelte:head>

<section class="hero">
	<div class="inner">
		<div class="hero-text">
			<p class="hero-title">{copy.hero.title}</p>
			<p class="sub">{copy.hero.subtitle}</p>
			<div class="tags">
				{#each copy.hero.tags as tag}
					<span class="tag">{tag}</span>
				{/each}
			</div>
		</div>
		<!-- <Ads300x250 /> -->
	</div>
</section>

<CompressVideo shareTitle={copy.meta.title} />

<div class="inner seo">
	{@html data.seoHtml}
</div>

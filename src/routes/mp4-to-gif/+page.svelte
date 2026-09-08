<script lang="ts">
	import { getStrings } from '$lib/i18n';
	import Seo from '$lib/components/seo/Seo.svelte';
	import CreatifyLabAd from '$lib/components/ads/CreatifyLabAd.svelte';
	import ConvertVideoToGif from '$lib/components/tool/ConvertVideoToGif.svelte';

	let { data } = $props();
	const t = getStrings();
	const copy = t.pages.mp4ToGif;
</script>

<Seo title={copy.meta.title} description={copy.meta.description} faqItems={data.faqItems} app />

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
		<CreatifyLabAd />
	</div>
</section>

<ConvertVideoToGif shareTitle={copy.meta.title} />

<div class="inner seo">
	{@html data.seoHtml}
</div>

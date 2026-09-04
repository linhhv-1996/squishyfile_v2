<script lang="ts">
	import { getStrings } from '$lib/i18n';
	import Seo from '$lib/components/seo/Seo.svelte';
	import NordVpnAd from '$lib/components/ads/NordVpnAd.svelte';
	import ConvertVideoToMp3 from '$lib/components/tool/ConvertVideoToMp3.svelte';

	let { data } = $props();
	const t = getStrings();
	const copy = t.pages.movToMp3;
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
		<NordVpnAd />
	</div>
</section>

<ConvertVideoToMp3
	shareTitle={copy.meta.title}
	samplePath="/7-Coding-Laws-of-Senior-Developer.mov"
	sampleFileName="7-Coding-Laws-of-Senior-Developer.mov"
	sampleMimeType="video/quicktime"
/>

<div class="inner seo">
	{@html data.seoHtml}
</div>

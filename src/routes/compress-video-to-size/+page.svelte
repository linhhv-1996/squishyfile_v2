<script lang="ts">
	import { getStrings } from '$lib/i18n';
	import Seo from '$lib/components/seo/Seo.svelte';
	import NordVpnAd from '$lib/components/ads/NordVpnAd.svelte';
	import CompressVideo from '$lib/components/tool/CompressVideo.svelte';

	let { data } = $props();
	const t = getStrings();
	const copy = t.pages.compressToSize;
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

<CompressVideo shareTitle={copy.meta.title} />

<div class="inner seo">
	{@html data.seoHtml}
</div>

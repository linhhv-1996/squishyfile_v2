<script lang="ts">
	import { getStrings } from '$lib/i18n';
	import Seo from '$lib/components/seo/Seo.svelte';

	let { data } = $props();
	const t = getStrings();
	const copy = t.pages.blog;
</script>

<Seo title={data.post.title} description={data.post.description} type="article" />

<div class="inner seo blog-post">
	<img
		class="blog-banner"
		src={data.post.bannerUri}
		alt={data.post.title}
		width="1200"
		height="630"
		loading="eager"
		fetchpriority="high"
	/>
	{@html data.post.html}
	<p class="blog-back"><a href="/blog">← {copy.backToBlog}</a></p>
</div>

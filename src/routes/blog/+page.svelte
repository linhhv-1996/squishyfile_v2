<script lang="ts">
	import { getStrings } from '$lib/i18n';
	import Seo from '$lib/components/seo/Seo.svelte';

	let { data } = $props();
	const t = getStrings();
	const copy = t.pages.blog;

	function formatDate(value: string) {
		if (!value) return '';
		return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}
</script>

<Seo title={copy.meta.title} description={copy.meta.description} />

<section class="blog-hero">
	<div class="inner">
		<h1>{copy.hero.title}</h1>
		<p class="sub">{copy.hero.subtitle}</p>
	</div>
</section>

<div class="inner blog-list">
	{#each data.posts as post (post.slug)}
		<a class="blog-card" href={`/blog/${post.slug}`}>
			<span class="blog-card-date">{formatDate(post.date)}</span>
			<h2>{post.title}</h2>
			<p>{post.excerpt}</p>
			<span class="blog-card-readmore">{copy.readMore} →</span>
		</a>
	{/each}
</div>

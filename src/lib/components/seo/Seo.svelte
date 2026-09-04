<script lang="ts">
	// Central SEO component — every page renders this once instead of
	// hand-rolling its own <svelte:head>. Covers <title>, meta description,
	// canonical link, Open Graph and Twitter Card tags, and an optional
	// noindex flag. Open Graph / Twitter image is optional: the site has no
	// dedicated 1200×630 OG image yet, so omit `image` rather than pointing
	// it at something the wrong aspect ratio (favicon.png etc).
	import { page } from '$app/state';
	import { SITE_URL, SITE_NAME } from '$lib/seo';

	let {
		title,
		description,
		path,
		image,
		type = 'website',
		noindex = false
	}: {
		title: string;
		description: string;
		/** Defaults to the current route's pathname (no query string). */
		path?: string;
		/** Absolute URL to a social preview image, if one exists. */
		image?: string;
		type?: 'website' | 'article';
		noindex?: boolean;
	} = $props();

	let canonical = $derived(`${SITE_URL}${path ?? page.url.pathname}`);
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />
	{#if noindex}
		<meta name="robots" content="noindex, nofollow" />
	{/if}

	<meta property="og:type" content={type} />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonical} />
	{#if image}
		<meta property="og:image" content={image} />
	{/if}

	<meta name="twitter:card" content={image ? 'summary_large_image' : 'summary'} />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	{#if image}
		<meta name="twitter:image" content={image} />
	{/if}
</svelte:head>

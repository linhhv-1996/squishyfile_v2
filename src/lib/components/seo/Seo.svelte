<script lang="ts">
	// Central SEO component — every page renders this once instead of
	// hand-rolling its own <svelte:head>. Covers <title>, meta description,
	// canonical link, Open Graph and Twitter Card tags (image is a single
	// shared og-<locale>.jpg — see ogImage() in $lib/seo, no per-page image
	// prop), an optional noindex flag, and JSON-LD structured data:
	// FAQPage when the page has real Q&A content, WebApplication for the
	// tool pages.
	import { page } from '$app/state';
	import { SITE_URL, SITE_NAME, ogImage, ogLocale } from '$lib/seo';
	import type { FaqItem } from '$lib/server/content';

	let {
		title,
		description,
		path,
		type = 'website',
		noindex = false,
		faqItems = [],
		app = false
	}: {
		title: string;
		description: string;
		/** Defaults to the current route's pathname (no query string). */
		path?: string;
		type?: 'website' | 'article';
		noindex?: boolean;
		/** Genuine Q&A pairs to emit as FAQPage structured data. */
		faqItems?: FaqItem[];
		/** True on pages that host the actual tool — emits WebApplication structured data. */
		app?: boolean;
	} = $props();

	let canonical = $derived(`${SITE_URL}${path ?? page.url.pathname}`);
	let image = ogImage();

	let faqLd = $derived(
		faqItems.length
			? {
					'@context': 'https://schema.org',
					'@type': 'FAQPage',
					mainEntity: faqItems.map((item) => ({
						'@type': 'Question',
						name: item.question,
						acceptedAnswer: { '@type': 'Answer', text: item.answer }
					}))
				}
			: null
	);

	let appLd = $derived(
		app
			? {
					'@context': 'https://schema.org',
					'@type': 'WebApplication',
					name: SITE_NAME,
					url: canonical,
					description,
					applicationCategory: 'MultimediaApplication',
					operatingSystem: 'Any (runs in the browser)',
					offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
				}
			: null
	);
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
	<meta property="og:locale" content={ogLocale()} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={image} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={image} />

	{#if faqLd}
		{@html `<script type="application/ld+json">${JSON.stringify(faqLd)}<\/script>`}
	{/if}
	{#if appLd}
		{@html `<script type="application/ld+json">${JSON.stringify(appLd)}<\/script>`}
	{/if}
</svelte:head>

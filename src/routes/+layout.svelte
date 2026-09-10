<script lang="ts">
	// import favicon from '$lib/assets/favicon.svg';
	// Global stylesheet lives at src/global.css, right next to app.html —
	// imported once here so it applies to every page. (Vite can only turn a
	// plain <link> in app.html into a working stylesheet for files under
	// static/; a src/ file has to go through an import like this one to end
	// up in the build.)
	import '../global.css';
	import Header from '$lib/components/layout/Header.svelte';
	import Footer from '$lib/components/layout/Footer.svelte';
	import BookmarkToast from '$lib/components/layout/BookmarkToast.svelte';

	let { data, children } = $props();
</script>

<svelte:head>
	<!-- <link rel="icon" href={favicon} /> -->
	{#if data.analyticsEnabled}
		<!-- Google tag (gtag.js) -->
		<script async src="https://www.googletagmanager.com/gtag/js?id=G-BK3HWZ4TZN"></script>
		<script>
			window.dataLayer = window.dataLayer || [];
			function gtag(){dataLayer.push(arguments);}
			gtag('js', new Date());
			gtag('config', 'G-BK3HWZ4TZN');
		</script>
	{/if}
</svelte:head>

<Header />
{@render children()}
<Footer />
<BookmarkToast />

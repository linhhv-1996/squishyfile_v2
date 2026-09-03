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

	let { children } = $props();
</script>

<svelte:head>
	<!-- <link rel="icon" href={favicon} /> -->
</svelte:head>

<Header />
{@render children()}
<Footer />

<script lang="ts">
	import { page } from '$app/state';
	import { getStrings } from '$lib/i18n';
	import { videoRoutes } from '$lib/nav';

	const t = getStrings();

	let isVideoSection = $derived(videoRoutes.includes(page.url.pathname));
</script>

<header class="site-header">
	<div class="inner">
		<a href="/" class="logo">
			<!-- <span class="mark">{t.site.emoji}</span> -->
			<span class="name">{t.site.name}<span class="accent">{t.site.nameAccent}</span></span>
		</a>
		<nav class="main-nav">
			<div class="nav-tools">
				{#each t.nav.categories as category (category.label)}
					<a href={category.href} class:active={category.href === '/' && isVideoSection}>
						{category.label}
					</a>
				{/each}
			</div>
			<a href="#how-it-works">{t.nav.howItWorks}</a>
			<a href="#faq">{t.nav.faq}</a>
		</nav>
	</div>
</header>

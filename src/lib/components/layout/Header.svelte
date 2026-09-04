<script lang="ts">
	import { page } from '$app/state';
	import { getStrings } from '$lib/i18n';
	import { videoRoutes } from '$lib/nav';

	const t = getStrings();

	let isVideoSection = $derived(videoRoutes.includes(page.url.pathname));
	let menuOpen = $state(false);

	// "Video" represents all 3 compress-tool pages under one nav link, so it
	// highlights for the whole section. Every other nav link (Video to MP3,
	// MP4 to MP3, ...) now points at its own distinct page, so those only
	// highlight on an exact match -- otherwise being on /video-to-mp3 would
	// light up the "MP4 to MP3" link too, which is exactly the confusing
	// behavior this replaced (a single shared mp3-section link that pointed
	// away from the hub page while you were already on it).
	function isActive(href: string): boolean {
		if (videoRoutes.includes(href)) return isVideoSection;
		return href === page.url.pathname;
	}

	// On mobile the full nav collapses behind a hamburger; this one link stays
	// visible in the header bar so the most-searched tool is never more than
	// one tap away. Pulled from the same i18n list rather than hardcoded so
	// the label stays in sync if it's ever renamed/localized.
	let mobileQuickLink = $derived(t.nav.categories.find((c) => c.href === '/mp4-to-mp3'));

	function closeMenu() {
		menuOpen = false;
	}

	// Fullscreen mobile menu: lock body scroll while it's open.
	$effect(() => {
		if (typeof document === 'undefined') return;
		document.body.style.overflow = menuOpen ? 'hidden' : '';
		return () => {
			document.body.style.overflow = '';
		};
	});
</script>

<header class="site-header">
	<div class="inner">
		<a href="/" class="logo">
			<img src="/logo.webp" alt="" class="logo-img" width="96" height="96" />
			<span class="name">{t.site.name}<span class="accent">{t.site.nameAccent}</span></span>
		</a>

		<div class="mobile-controls">
			{#if mobileQuickLink}
				<a
					href={mobileQuickLink.href}
					class="mobile-link"
					class:active={isActive(mobileQuickLink.href)}
					onclick={closeMenu}
				>
					{mobileQuickLink.label}
				</a>
			{/if}
			<button
				type="button"
				class="menu-toggle"
				class:open={menuOpen}
				aria-label="Toggle menu"
				aria-expanded={menuOpen}
				onclick={() => (menuOpen = !menuOpen)}
			>
				<span class="bar"></span>
				<span class="bar"></span>
				<span class="bar"></span>
			</button>
		</div>

		<nav class="main-nav" class:open={menuOpen}>
			<div class="nav-tools">
				{#each t.nav.categories as category (category.label)}
					<a href={category.href} class:active={isActive(category.href)} onclick={closeMenu}>
						{category.label}
					</a>
				{/each}
			</div>
			<a
				href="/blog"
				class:active={page.url.pathname.startsWith('/blog')}
				onclick={closeMenu}
			>
				{t.nav.blog}
			</a>
			<a href="#how-it-works" onclick={closeMenu}>{t.nav.howItWorks}</a>
			<a href="#faq" onclick={closeMenu}>{t.nav.faq}</a>
		</nav>
	</div>
</header>

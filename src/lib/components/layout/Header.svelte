<script lang="ts">
	import { page } from '$app/state';
	import { getStrings } from '$lib/i18n';

	const t = getStrings();

	let menuOpen = $state(false);
	// Which top-level tool menu (by group label) is currently open on
	// desktop -- 3 separate menus (Compress / Convert / Enhance) now, not
	// one combined "Tools" dropdown, so only one can be open at a time.
	// Unrelated to the mobile fullscreen menu's own open state: on mobile
	// every group is always shown expanded inline (see the max-width:640px
	// block in global.css), this only matters on desktop.
	let toolsOpen = $state<string | null>(null);
	let toolsRowEl = $state<HTMLDivElement>();

	// Every tool link points at its own distinct page, so every one of them
	// (including the 3 compress pages) only highlights on an exact match --
	// no more "whole section lights up together" special-casing, which used
	// to make all 3 compress pages look active at once whenever any one of
	// them was current.
	function isActive(href: string): boolean {
		return href === page.url.pathname;
	}

	// A group's own trigger should read as active whenever the current page
	// is one of its items, even while its panel is collapsed -- otherwise
	// landing on e.g. /video-upscaler would show no active nav state at all
	// in the collapsed header. The home page ("/") is excluded on purpose:
	// it's already covered by the separate "Home" link, so without this the
	// Compress trigger and "Home" would both light up at once on "/".
	function isGroupActive(items: { href: string }[]): boolean {
		return items.some((item) => item.href !== '/' && isActive(item.href));
	}

	// Flattened for the mobile-only horizontal shortcut strip below the
	// header row -- that strip has no room for group headings, just quick
	// taps.
	const allToolLinks = $derived(t.nav.toolGroups.flatMap((group) => group.items));

	// Same, but for the fullscreen mobile menu's flat tool list -- minus
	// "Video Compressor" ("/"), which is just the home page under another
	// name. The "Home" link right above it already covers that page, so
	// keeping both means the exact same page shows up twice and both light
	// up together while you're on it, which looks like a bug.
	const mobileFlatLinks = $derived(allToolLinks.filter((link) => link.href !== '/'));

	function closeMenu() {
		menuOpen = false;
		toolsOpen = null;
	}

	function toggleGroup(label: string) {
		toolsOpen = toolsOpen === label ? null : label;
	}

	// Clicking anywhere outside the 3 dropdowns closes whichever is open --
	// standard dropdown behavior, and without it the panel would stay open
	// until the user picked a link or pressed Escape.
	function onWindowClick(event: MouseEvent) {
		if (!toolsOpen) return;
		if (toolsRowEl && !toolsRowEl.contains(event.target as Node)) {
			toolsOpen = null;
		}
	}

	function onWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') toolsOpen = null;
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

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeydown} />

<header class="site-header">
	<div class="inner">
		<a href="/" class="logo">
			<img src="/logo.webp" alt="" class="logo-img" width="96" height="96" />
			<span class="name">{t.site.name}<span class="accent">{t.site.nameAccent}</span></span>
		</a>

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

		<nav class="main-nav" class:open={menuOpen}>
			<a
				href="/"
				class:active={page.url.pathname === '/'}
				onclick={closeMenu}
			>
				{t.nav.home}
			</a>

			<!-- Desktop only: 3 separate grouped dropdowns (Compress / Convert /
			     Enhance). Hidden on mobile in favor of the flat list right below
			     -- see .nav-tools-row in the max-width:640px block. -->
			<div class="nav-tools-row" bind:this={toolsRowEl}>
				{#each t.nav.toolGroups as group (group.label)}
					<div class="nav-tools-dropdown">
						<button
							type="button"
							class="nav-tools-trigger"
							class:active={isGroupActive(group.items)}
							aria-expanded={toolsOpen === group.label}
							onclick={() => toggleGroup(group.label)}
						>
							{group.label}
							<svg
								class="chevron"
								class:open={toolsOpen === group.label}
								viewBox="0 0 20 20"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path d="m5 7 5 5 5-5" />
							</svg>
						</button>

						<div class="tools-panel" class:open={toolsOpen === group.label}>
							{#each group.items as item (item.label)}
								<a href={item.href} class:active={isActive(item.href)} onclick={closeMenu}>
									{item.label}
								</a>
							{/each}
						</div>
					</div>
				{/each}
			</div>

			<!-- Mobile only: every tool link flat, no group headings -- the
			     fullscreen menu is already a deliberate "see everything" view,
			     grouping just adds visual noise there. Desktop hides this in
			     favor of the 3 dropdowns above. -->
			<div class="mobile-tools-flat">
				{#each mobileFlatLinks as link (link.label)}
					<a href={link.href} class:active={isActive(link.href)} onclick={closeMenu}>
						{link.label}
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
			<!-- <a href="#how-it-works" onclick={closeMenu}>{t.nav.howItWorks}</a>
			<a href="#faq" onclick={closeMenu}>{t.nav.faq}</a> -->
		</nav>
	</div>

	<!-- Mobile-only shortcut strip: every tool one tap away without touching
	     the hamburger, and it scrolls horizontally so adding more tools here
	     later never squeezes the logo/hamburger row above. Reuses the same
	     flattened tool list + isActive() as the desktop menus / mobile
	     fullscreen menu so a highlighted tool always agrees across all
	     three navs. -->
	<div class="mobile-tool-chips">
		{#each allToolLinks as link (link.label)}
			<a href={link.href} class:active={isActive(link.href)} onclick={closeMenu}>
				{link.label}
			</a>
		{/each}
	</div>
</header>

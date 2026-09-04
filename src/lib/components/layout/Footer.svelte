<script lang="ts">
	import { getStrings } from '$lib/i18n';

	const t = getStrings();
	const siteName = `${t.site.name}${t.site.nameAccent}`;
	const copyright = t.footer.copyright
		.replace('{year}', String(new Date().getFullYear()))
		.replace('{siteName}', siteName);
</script>

<footer class="site-footer">
	<div class="inner">
		<a href="/" class="footer-logo">
			<!-- <span class="mark">{t.site.emoji}</span> -->
			<span class="name">{t.site.name}<span class="accent">{t.site.nameAccent}</span></span>
		</a>
		<p class="footer-tagline">{t.site.tagline}</p>

		<div class="footer-tools">
			<span class="footer-tools-label">{t.footer.toolsHeading}</span>
			<div class="footer-links">
				{#each t.footer.toolLinks as link (link.label)}
					<a href={link.href}>{link.label}</a>
				{/each}
			</div>
		</div>

		<div class="footer-links">
			{#each t.footer.links as link (link.label)}
				<a href={link.href}>{link.label}</a>
			{/each}
		</div>
		<p class="footer-copy">{copyright}</p>
	</div>
</footer>

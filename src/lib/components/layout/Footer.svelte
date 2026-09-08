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

		<!-- SEO: every tool link is rendered flat in the markup (no
		     click-to-reveal), grouped under its own heading to mirror the
		     header's Compress / Convert / Enhance structure -- crawlers and
		     users both see the full sitemap-style list at once. -->
		<div class="footer-tools-groups">
			{#each t.footer.toolGroups as group (group.label)}
				<div class="footer-tools-group">
					<span class="footer-tools-label">{group.label}</span>
					<div
						class="footer-links footer-links-tools"
						style:column-count={group.items.length > 4 ? 2 : 1}
					>
						{#each group.items as link (link.label)}
							<a href={link.href}>{link.label}</a>
						{/each}
					</div>
				</div>
			{/each}
		</div>

		<div class="footer-links">
			{#each t.footer.links as link (link.label)}
				<a href={link.href}>{link.label}</a>
			{/each}
		</div>
		<p class="footer-copy">{copyright}</p>
	</div>
</footer>

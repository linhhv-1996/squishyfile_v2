<script lang="ts">
	// Small, unobtrusive "buy me a coffee" nudge. Plain text + link, styled to
	// match the ShareRow row it usually sits next to — no button, no popup,
	// just an honest ask.
	import { getStrings } from '$lib/i18n';

	const t = getStrings();
</script>

<p class="support">
	{t.support.text}
	<a href={t.support.href} target="_blank" rel="noopener noreferrer">{t.support.linkLabel}</a>
</p>

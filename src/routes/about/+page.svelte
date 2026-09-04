<script lang="ts">
	import { getStrings } from '$lib/i18n';
	import Seo from '$lib/components/seo/Seo.svelte';

	let { data } = $props();
	const t = getStrings();
	const copy = t.pages.about;
</script>

<Seo title={copy.meta.title} description={copy.meta.description} />

<div class="inner seo">
	{@html data.pageHtml}
</div>

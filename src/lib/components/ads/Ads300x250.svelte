<script lang="ts">
	// Standalone 300x250 ad slot placeholder. The site has no ad network wired
	// up yet, so this just renders the reserved space from the design — swap
	// the inner markup for a real ad unit later without touching call sites.
	import { getStrings } from '$lib/i18n';

	const t = getStrings();
</script>

<div class="ad-slot">{t.ads.placeholder}</div>

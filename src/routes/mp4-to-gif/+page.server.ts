import type { PageServerLoad } from './$types';
import { loadSeoContent } from '$lib/server/content';

export const load: PageServerLoad = () => {
	const { html, faqItems } = loadSeoContent('mp4-to-gif');
	return { seoHtml: html, faqItems };
};

import type { PageServerLoad } from './$types';
import { loadSeoContent } from '$lib/server/content';

export const load: PageServerLoad = () => {
	const { html, faqItems } = loadSeoContent('video-to-mp3');
	return { seoHtml: html, faqItems };
};

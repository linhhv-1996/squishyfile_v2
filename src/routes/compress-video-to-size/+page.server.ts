import type { PageServerLoad } from './$types';
import { loadSeoContent } from '$lib/server/content';

export const load: PageServerLoad = () => {
	const { html, faqItems } = loadSeoContent('compress-video-to-size');
	return { seoHtml: html, faqItems };
};

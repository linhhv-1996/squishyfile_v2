import type { PageServerLoad } from './$types';
import { loadSeoContent } from '$lib/server/content';

export const load: PageServerLoad = () => {
	return {
		seoHtml: loadSeoContent('home')
	};
};

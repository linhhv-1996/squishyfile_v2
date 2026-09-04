import type { PageServerLoad } from './$types';
import { loadPageContent } from '$lib/server/content';

export const load: PageServerLoad = () => {
	return {
		pageHtml: loadPageContent('about')
	};
};

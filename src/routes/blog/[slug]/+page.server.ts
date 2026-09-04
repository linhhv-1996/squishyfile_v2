import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { loadBlogPost } from '$lib/server/blog';

export const load: PageServerLoad = ({ params }) => {
	try {
		return {
			post: loadBlogPost(params.slug)
		};
	} catch {
		throw error(404, 'Post not found');
	}
};

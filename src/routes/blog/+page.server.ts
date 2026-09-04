import type { PageServerLoad } from './$types';
import { listBlogPosts } from '$lib/server/blog';

export const load: PageServerLoad = () => {
	return {
		posts: listBlogPosts()
	};
};

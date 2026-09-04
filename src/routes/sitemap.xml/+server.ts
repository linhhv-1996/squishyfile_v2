import type { RequestHandler } from './$types';
import { SITE_URL, siteRoutes } from '$lib/seo';
import { listBlogPosts } from '$lib/server/blog';

// /sitemap.xml — statically prerendered at build time (no per-request data,
// so prerender avoids regenerating this on every crawl hit).
export const prerender = true;

export const GET: RequestHandler = () => {
	const lastmod = new Date().toISOString().slice(0, 10);

	const blogRoutes = listBlogPosts().map((post) => ({
		path: `/blog/${post.slug}`,
		changefreq: 'monthly' as const,
		priority: 0.5
	}));

	const urls = [...siteRoutes, ...blogRoutes]
		.map(
			({ path, changefreq, priority }) => `
	<url>
		<loc>${SITE_URL}${path}</loc>
		<lastmod>${lastmod}</lastmod>
		<changefreq>${changefreq}</changefreq>
		<priority>${priority.toFixed(1)}</priority>
	</url>`
		)
		.join('');

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>
`;

	return new Response(body, {
		headers: {
			'Content-Type': 'application/xml'
		}
	});
};

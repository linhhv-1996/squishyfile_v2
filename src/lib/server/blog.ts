// Reads and renders blog posts that live under /contents/blog (repo root,
// outside src) — plain markdown files with a small frontmatter block for
// title/description/date/excerpt, one file per post per locale:
//   contents/blog/<slug>.<locale>.md
//
// No frontmatter library is used (the site has no other dependency on
// one) — parseFrontmatter below is a minimal `key: value` block parser,
// good enough for the flat string fields blog posts need.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import { defaultLocale, type Locale } from '$lib/i18n';

const BLOG_ROOT = path.resolve(process.cwd(), 'contents', 'blog');

export type BlogMeta = {
	slug: string;
	title: string;
	description: string;
	date: string;
	excerpt: string;
};

export type BlogPost = BlogMeta & { html: string };

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
	const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return { meta: {}, body: raw };
	const [, frontmatter, body] = match;
	const meta: Record<string, string> = {};
	for (const line of frontmatter.split('\n')) {
		const idx = line.indexOf(':');
		if (idx === -1) continue;
		const key = line.slice(0, idx).trim();
		let value = line.slice(idx + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		meta[key] = value;
	}
	return { meta, body };
}

function listSlugs(locale: Locale): string[] {
	const suffix = `.${locale}.md`;
	return readdirSync(BLOG_ROOT)
		.filter((file) => file.endsWith(suffix))
		.map((file) => file.slice(0, -suffix.length));
}

/** All posts for a locale, newest first. */
export function listBlogPosts(locale: Locale = defaultLocale): BlogMeta[] {
	return listSlugs(locale)
		.map((slug) => {
			const raw = readFileSync(path.join(BLOG_ROOT, `${slug}.${locale}.md`), 'utf-8');
			const { meta } = parseFrontmatter(raw);
			return {
				slug,
				title: meta.title ?? slug,
				description: meta.description ?? '',
				date: meta.date ?? '',
				excerpt: meta.excerpt ?? meta.description ?? ''
			};
		})
		.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Throws (ENOENT) if the slug doesn't exist — callers should catch and 404. */
export function loadBlogPost(slug: string, locale: Locale = defaultLocale): BlogPost {
	const raw = readFileSync(path.join(BLOG_ROOT, `${slug}.${locale}.md`), 'utf-8');
	const { meta, body } = parseFrontmatter(raw);
	return {
		slug,
		title: meta.title ?? slug,
		description: meta.description ?? '',
		date: meta.date ?? '',
		excerpt: meta.excerpt ?? meta.description ?? '',
		html: marked.parse(body, { async: false }) as string
	};
}

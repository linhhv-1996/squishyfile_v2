// Reads and renders blog posts that live under /contents/blog (repo root,
// outside src) — plain markdown files with a small frontmatter block for
// title/description/date/excerpt, one file per post per locale:
//   contents/blog/<slug>.<locale>.md
//
// Content is bundled at build time via import.meta.glob (eager, raw
// string) rather than read from disk at request time: Cloudflare Workers
// have no real filesystem, so node:fs reads that work in local dev would
// throw/return nothing once deployed there.
//
// No frontmatter library is used (the site has no other dependency on
// one) — parseFrontmatter below is a minimal `key: value` block parser,
// good enough for the flat string fields blog posts need.
import { marked } from 'marked';
import { defaultLocale, type Locale } from '$lib/i18n';
import { generateBlogBanner } from './blogBanner';

// Path key format: /contents/blog/<slug>.<locale>.md
const BLOG_FILES = import.meta.glob('/contents/blog/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const BLOG_DIR_PREFIX = '/contents/blog/';

export type BlogMeta = {
	slug: string;
	title: string;
	description: string;
	date: string;
	excerpt: string;
};

export type BlogPost = BlogMeta & { html: string; bannerUri: string };

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
	return Object.keys(BLOG_FILES)
		.filter((filePath) => filePath.endsWith(suffix))
		.map((filePath) => filePath.slice(BLOG_DIR_PREFIX.length, -suffix.length));
}

/** Throws (ENOENT-style) if the slug/locale combo wasn't bundled. */
function readBlogFile(slug: string, locale: Locale): string {
	const key = `${BLOG_DIR_PREFIX}${slug}.${locale}.md`;
	const raw = BLOG_FILES[key];
	if (raw === undefined) {
		throw new Error(`ENOENT: blog post not found: ${key}`);
	}
	return raw;
}

/** All posts for a locale, newest first. */
export function listBlogPosts(locale: Locale = defaultLocale): BlogMeta[] {
	return listSlugs(locale)
		.map((slug) => {
			const raw = readBlogFile(slug, locale);
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

/** Throws if the slug doesn't exist — callers should catch and 404. */
export function loadBlogPost(slug: string, locale: Locale = defaultLocale): BlogPost {
	const raw = readBlogFile(slug, locale);
	const { meta, body } = parseFrontmatter(raw);
	const title = meta.title ?? slug;
	return {
		slug,
		title,
		description: meta.description ?? '',
		date: meta.date ?? '',
		excerpt: meta.excerpt ?? meta.description ?? '',
		html: marked.parse(body, { async: false }) as string,
		bannerUri: generateBlogBanner(slug, title)
	};
}

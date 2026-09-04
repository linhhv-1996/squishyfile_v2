// Reads and renders markdown page copy that lives under /contents (repo
// root, outside src) — kept there so non-developers can edit page copy
// without touching component code. Locale suffix is baked into the
// filename from day one (e.g. "home.en.md") so adding a language later is
// just adding "home.vi.md" etc.
//
// Two subfolders:
//   contents/seo/<slug>.<locale>.md   — long-form SEO body content below a tool
//   contents/pages/<slug>.<locale>.md — static site pages (About, Contact,
//                                        Privacy, Terms, etc.)
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import { defaultLocale, type Locale } from '$lib/i18n';

const CONTENT_ROOT = path.resolve(process.cwd(), 'contents');

function loadContent(dir: 'seo' | 'pages', slug: string, locale: Locale = defaultLocale): string {
	const filePath = path.join(CONTENT_ROOT, dir, `${slug}.${locale}.md`);
	const raw = readFileSync(filePath, 'utf-8');
	return marked.parse(raw, { async: false }) as string;
}

export function loadSeoContent(slug: string, locale: Locale = defaultLocale): string {
	return loadContent('seo', slug, locale);
}

export function loadPageContent(slug: string, locale: Locale = defaultLocale): string {
	return loadContent('pages', slug, locale);
}

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

export type FaqItem = { question: string; answer: string };

const HTML_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	mdash: '—',
	ndash: '–',
	nbsp: ' ',
	rsquo: '’',
	lsquo: '‘',
	rdquo: '”',
	ldquo: '“'
};

function decodeEntities(str: string): string {
	return str.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
		if (code[0] === '#') {
			const codePoint =
				code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
			return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
		}
		return HTML_ENTITIES[code.toLowerCase()] ?? match;
	});
}

function stripTags(html: string): string {
	return decodeEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

// Pulls genuine Q&A pairs out of `.faq-card` blocks for FAQPage structured
// data. Some pages also reuse the `.faq-card` markup for non-FAQ comparison
// grids ("Desktop apps (Handbrake, VLC)" vs "SquishyFile", etc.) — those
// aren't real questions and Google's FAQPage guidelines require genuine
// Q&A, so we only keep cards whose heading actually ends in "?" rather than
// grabbing every `.faq-card` on the page.
const FAQ_CARD_RE = /<div class="faq-card"><h3>([\s\S]*?)<\/h3><p>([\s\S]*?)<\/p><\/div>/g;

export function extractFaqItems(html: string): FaqItem[] {
	const items: FaqItem[] = [];
	for (const match of html.matchAll(FAQ_CARD_RE)) {
		const question = stripTags(match[1]);
		const answer = stripTags(match[2]);
		if (question.endsWith('?') && question && answer) {
			items.push({ question, answer });
		}
	}
	return items;
}

function loadContent(dir: 'seo' | 'pages', slug: string, locale: Locale = defaultLocale): string {
	const filePath = path.join(CONTENT_ROOT, dir, `${slug}.${locale}.md`);
	const raw = readFileSync(filePath, 'utf-8');
	return marked.parse(raw, { async: false }) as string;
}

export function loadSeoContent(
	slug: string,
	locale: Locale = defaultLocale
): { html: string; faqItems: FaqItem[] } {
	const html = loadContent('seo', slug, locale);
	return { html, faqItems: extractFaqItems(html) };
}

export function loadPageContent(slug: string, locale: Locale = defaultLocale): string {
	return loadContent('pages', slug, locale);
}

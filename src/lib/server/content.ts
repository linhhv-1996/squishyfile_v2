// Reads and renders the per-page SEO markdown that lives under
// /contents/seo (repo root, outside src) — kept there so non-developers can
// edit page copy without touching component code. Locale suffix is baked
// into the filename from day one (e.g. "home.en.md") so adding a language
// later is just adding "home.vi.md" etc.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import { defaultLocale, type Locale } from '$lib/i18n';

const CONTENT_DIR = path.resolve(process.cwd(), 'contents', 'seo');

export function loadSeoContent(slug: string, locale: Locale = defaultLocale): string {
	const filePath = path.join(CONTENT_DIR, `${slug}.${locale}.md`);
	const raw = readFileSync(filePath, 'utf-8');
	return marked.parse(raw, { async: false }) as string;
}

// Single source of truth for site-wide SEO facts: the canonical domain,
// the site name used in Open Graph tags, and the list of indexable routes
// (shared by the <Seo> component's canonical-URL fallback and by the
// /sitemap.xml route, so a new page only needs to be added here once).
import { defaultLocale, type Locale } from '$lib/i18n';

export const SITE_URL = 'https://squishyfile.com';
export const SITE_NAME = 'SquishyFile';

export type SitemapRoute = {
	path: string;
	changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly';
	priority: number;
};

// Add a new page here when it's added to src/routes — this list drives
// /sitemap.xml directly.
export const siteRoutes: SitemapRoute[] = [
	{ path: '/', changefreq: 'weekly', priority: 1.0 },
	{ path: '/compress-video-to-size', changefreq: 'weekly', priority: 0.9 },
	{ path: '/compress-video-on-iphone', changefreq: 'weekly', priority: 0.9 },
	{ path: '/blog', changefreq: 'weekly', priority: 0.6 },
	{ path: '/about', changefreq: 'yearly', priority: 0.4 },
	{ path: '/contact', changefreq: 'yearly', priority: 0.3 },
	{ path: '/privacy', changefreq: 'yearly', priority: 0.3 },
	{ path: '/terms', changefreq: 'yearly', priority: 0.3 }
];

// One shared social-preview image per locale (e.g. /og-en.jpg), not one per
// page — <Seo> derives this itself instead of taking an `image` prop, so no
// page ever has to remember to pass one in. The file doesn't need to exist
// yet for this to be wired correctly; drop the actual 1200x630 image at
// static/og-<locale>.jpg whenever it's ready.
export function ogImage(locale: Locale = defaultLocale): string {
	return `${SITE_URL}/og-${locale}.jpg`;
}

// og:locale wants "en_US" style, not the bare "en" locale code used
// elsewhere in the codebase.
const OG_LOCALE_MAP: Record<Locale, string> = {
	en: 'en_US'
};

export function ogLocale(locale: Locale = defaultLocale): string {
	return OG_LOCALE_MAP[locale] ?? `${locale}_${locale.toUpperCase()}`;
}

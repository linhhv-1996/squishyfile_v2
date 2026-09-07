// Lightweight GA4 event tracking.
//
// Everything here is fire-and-forget: it only ever pushes an object onto
// window.dataLayer (that's what gtag() does under the hood), so it can never
// block, throw into a caller's flow, or add measurable latency to a tool's
// convert/encode path. Safe to call from anywhere, including during SSR
// (no-ops) and before gtag.js has finished loading (dataLayer already
// exists as a plain array by then -- see app.html -- so events just queue).
import { browser } from '$app/environment';

type EventParams = Record<string, string | number | boolean | undefined>;

declare global {
	interface Window {
		dataLayer?: unknown[];
		gtag?: (...args: unknown[]) => void;
	}
}

/** Fire a GA4 event. No-op outside the browser or if gtag isn't present. */
export function trackEvent(name: string, params: EventParams = {}): void {
	if (!browser) return;
	try {
		window.gtag?.('event', name, params);
	} catch (err) {
		// Tracking must never break the app it's watching.
		console.error('[analytics] trackEvent failed:', name, err);
	}
}

export function roundMb(bytes: number): number {
	return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

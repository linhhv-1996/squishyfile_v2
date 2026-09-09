// Picks which sponsor offer to show in the hero ad slot for a given route.
//
// All the business decisions -- which offer(s) run where, and whether a
// route is a fixed "target" or a "rotate" across several -- live in
// src/lib/config/offers.json (pure data, no code). This module is the only
// place that reads that file; OfferAd.svelte just renders whatever it picks.
// Swapping/adding offers or changing target vs. rotate per route is a JSON
// edit, never a component change.
//
// Placement.offers accepts either a bare offer id ("submagic") or, for
// weighted rotation, { id, weight } (default weight 1 -- higher shows more
// often). "target" mode always uses the first enabled id in the list, so a
// single-item list is a hard target and a longer list just documents the
// fallback order.
import offersData from '$lib/config/offers.json';

export type OfferTheme = 'light' | 'dark';

export interface Offer {
	enabled: boolean;
	url: string;
	theme: OfferTheme;
	logo?: string | null;
	accentFrom?: string;
	accentTo?: string;
	label: string;
	headline: string;
	subtitle: string;
	cta: string;
}

type OfferEntry = string | { id: string; weight?: number };

interface Placement {
	mode: 'target' | 'rotate';
	offers: OfferEntry[];
}

interface OffersConfig {
	offers: Record<string, Offer>;
	placements: Record<string, Placement>;
	default: Placement;
}

const config = offersData as OffersConfig;

function normalize(entries: OfferEntry[]): { id: string; weight: number }[] {
	return entries.map((entry) =>
		typeof entry === 'string' ? { id: entry, weight: 1 } : { id: entry.id, weight: entry.weight ?? 1 }
	);
}

function pickWeighted(refs: { id: string; weight: number }[]): string | null {
	const total = refs.reduce((sum, ref) => sum + ref.weight, 0);
	if (total <= 0) return null;
	let roll = Math.random() * total;
	for (const ref of refs) {
		roll -= ref.weight;
		if (roll <= 0) return ref.id;
	}
	return refs[refs.length - 1]?.id ?? null;
}

/**
 * Resolve which offer to render for `pathname` -- its config id plus full
 * data -- or null if the resolved placement has no enabled offers left.
 */
export function pickOffer(pathname: string): { id: string; offer: Offer } | null {
	const placement = config.placements[pathname] ?? config.default;
	if (!placement) return null;

	const enabledRefs = normalize(placement.offers).filter((ref) => config.offers[ref.id]?.enabled);
	if (enabledRefs.length === 0) return null;

	const id = placement.mode === 'rotate' ? pickWeighted(enabledRefs) : enabledRefs[0].id;
	if (!id) return null;

	const offer = config.offers[id];
	return offer ? { id, offer } : null;
}

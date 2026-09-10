import type { LayoutServerLoad } from './$types';

const ANALYTICS_BLOCKED_COUNTRIES = new Set(['CN', 'SG', 'RU', 'IN', 'IR', 'PK', 'ID']);

export const load: LayoutServerLoad = ({ platform }) => {
	const country = platform?.cf?.country;

	return {
		analyticsEnabled: !country || !ANALYTICS_BLOCKED_COUNTRIES.has(country)
	};
};

// Minimal i18n loader.
//
// All user-facing text lives in JSON dictionaries under `./locales`, never
// hard-coded in components. English is the default locale and is served at
// the unprefixed root ("/"), not "/en". Adding a language later means:
//   1. drop a new dictionary in ./locales (e.g. vi.json)
//   2. add it to the `dictionaries` map below
//   3. decide how the active locale is resolved (e.g. from a route param)
// No component code should need to change beyond that.

import en from './locales/en.json';

export const defaultLocale = 'en' as const;

const dictionaries = {
	en
} as const;

export type Locale = keyof typeof dictionaries;
export type Strings = typeof en;

export function getStrings(locale: Locale = defaultLocale): Strings {
	return dictionaries[locale] ?? dictionaries[defaultLocale];
}

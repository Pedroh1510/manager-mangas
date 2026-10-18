// The Vike shell preloads one hashed `pages` entry bundle; the Supabase
// client in it is built from the project url and the public anon JWT,
// assigned side by side (plan door 2).
const BUNDLE_PATH_PATTERN = /\/assets\/entries\/pages\.[\w-]+\.js/;
const ANON_KEY_PATTERN =
	/"https:\/\/supabase\.nexusmangas\.com",[\w$]+="(eyJ[\w.-]+)"/;

/**
 * Finds the pages entry bundle path in the site's shell HTML.
 * @example findBundlePath('<link href="/assets/entries/pages.Ab1.js">') // '/assets/entries/pages.Ab1.js'
 * @param {string} html
 * @returns {string | null}
 */
export function findBundlePath(html) {
	return html.match(BUNDLE_PATH_PATTERN)?.[0] ?? null;
}

/**
 * Extracts the Supabase anon key from the minified pages bundle.
 * @example findAnonKey('$s="https://supabase.nexusmangas.com",La="eyJ0.e30.s"') // 'eyJ0.e30.s'
 * @param {string} bundleSource
 * @returns {string | null}
 */
export function findAnonKey(bundleSource) {
	return bundleSource.match(ANON_KEY_PATTERN)?.[1] ?? null;
}

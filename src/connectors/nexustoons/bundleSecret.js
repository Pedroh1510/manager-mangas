// The SPA shell references a single hashed entry bundle; the cipher secret
// is a string literal handed to `<Cipher>.initFromSecret(...)` inside it.
const BUNDLE_PATH_PATTERN = /\/assets\/index-[\w-]+\.js/;
const SECRET_PATTERN =
	/const [\w$]+="([^"]+)";return await [\w$]+\.initFromSecret\(/;

/**
 * Finds the entry bundle path in the site's shell HTML.
 * @example findBundlePath('<script src="/assets/index-Ab1.js">') // '/assets/index-Ab1.js'
 * @param {string} html
 * @returns {string | null}
 */
export function findBundlePath(html) {
	return html.match(BUNDLE_PATH_PATTERN)?.[0] ?? null;
}

/**
 * Extracts the response-cipher secret from the minified entry bundle.
 * @example findCipherSecret('const e="S";return await Sr.initFromSecret(e)') // 'S'
 * @param {string} bundleSource
 * @returns {string | null}
 */
export function findCipherSecret(bundleSource) {
	return bundleSource.match(SECRET_PATTERN)?.[1] ?? null;
}

/**
 * Lowercase, accent-free, punctuation-free title with single spaces.
 * @example normalizeTitle('Caçador Suicida Rank-SSS') // 'cacador suicida rank sss'
 * @param {string} title
 * @returns {string}
 */
export function normalizeTitle(title) {
	return String(title ?? '')
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
		.trim();
}

/**
 * Trigram set of a title, with the same padding as pg_trgm: two spaces
 * before each word, one after.
 * @example trigrams('ab') // Set { '  a', ' ab', 'ab ' }
 * @param {string} title
 * @returns {Set<string>}
 */
export function trigrams(title) {
	const grams = new Set();
	for (const word of normalizeTitle(title).split(' ').filter(Boolean)) {
		const padded = `  ${word} `;
		for (let i = 0; i + 3 <= padded.length; i++) {
			grams.add(padded.slice(i, i + 3));
		}
	}
	return grams;
}

/**
 * Trigram similarity (shared / union) between two titles, 0 to 1.
 * @example titleSimilarity('Caçador Suicida', 'cacador suicida') // 1
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function titleSimilarity(a, b) {
	return gramSimilarity(trigrams(a), trigrams(b));
}

/**
 * Shared / union of two precomputed trigram sets, 0 to 1; lets a caller
 * build each catalog title's set once (alt-titles AC 33).
 * @example gramSimilarity(trigrams('a b'), trigrams('a b')) // 1
 * @param {Set<string>} first
 * @param {Set<string>} second
 * @returns {number}
 */
export function gramSimilarity(first, second) {
	if (!first.size || !second.size) return 0;
	let shared = 0;
	for (const gram of first) if (second.has(gram)) shared += 1;
	return shared / (first.size + second.size - shared);
}

/**
 * Best trigram similarity of `candidate` against any of `references`.
 * @example bestTitleSimilarity('Cacador Suicida', ['X', 'Caçador Suicida']) // 1
 * @param {string} candidate
 * @param {string[]} references
 * @returns {number}
 */
export function bestTitleSimilarity(candidate, references) {
	return Math.max(
		0,
		...references.map((reference) => titleSimilarity(candidate, reference)),
	);
}

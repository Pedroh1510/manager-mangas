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

// Same padding as pg_trgm: two spaces before each word, one after.
function trigrams(title) {
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
	const first = trigrams(a);
	const second = trigrams(b);
	if (!first.size || !second.size) return 0;
	const shared = [...first].filter((gram) => second.has(gram)).length;
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

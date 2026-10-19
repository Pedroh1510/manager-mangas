import { normalizeTitle } from '../service/coverSuggestions/titleSimilarity.js';

/**
 * Trimmed alternative titles without blanks, normalized duplicates or the
 * main title itself (alt-titles AC 4).
 * @example cleanAltTitles('Solo Leveling', ['Upando Sozinho', 'SOLO LEVELING']) // ['Upando Sozinho']
 * @param {string} title
 * @param {unknown[]|undefined} candidates
 * @returns {string[]}
 */
export function cleanAltTitles(title, candidates = []) {
	const seen = new Set([normalizeTitle(title)]);
	const kept = [];
	for (const candidate of candidates) {
		if (typeof candidate !== 'string') continue;
		const normalized = normalizeTitle(candidate);
		if (!normalized || seen.has(normalized)) continue;
		seen.add(normalized);
		kept.push(candidate.trim());
	}
	return kept;
}

/**
 * Whether the accent- and punctuation-free `term` appears in any of `titles`.
 * @example titlesMatch('cacador', ['Caçador Suicida']) // true
 * @param {string} term
 * @param {string[]} titles
 * @returns {boolean}
 */
export function titlesMatch(term, titles) {
	const needle = normalizeTitle(term);
	return titles.some((title) => normalizeTitle(title).includes(needle));
}

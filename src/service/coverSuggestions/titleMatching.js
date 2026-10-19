import { gramSimilarity, normalizeTitle, trigrams } from './titleSimilarity.js';

// A shorter title matches too many works to open a suggestion on its own
// (alt-titles AC 29).
const MIN_ENTRY_WORDS = 2;
const MIN_ENTRY_CHARS = 6;

function isLongTitle(title) {
	const normalized = normalizeTitle(title);
	return (
		normalized.length >= MIN_ENTRY_CHARS &&
		normalized.split(' ').length >= MIN_ENTRY_WORDS
	);
}

/**
 * Title forms compared by trigram: the set once, plus whether the title is
 * long enough to open a title-only suggestion.
 * @example toTitleForms(['Upando Sozinho']) // [{ grams: Set {...}, long: true }]
 * @param {string[]} titles
 * @returns {{grams: Set<string>, long: boolean}[]}
 */
export function toTitleForms(titles) {
	return titles
		.filter(Boolean)
		.map((title) => ({ grams: trigrams(title), long: isLongTitle(title) }));
}

/**
 * Catalog items with their title forms, built once per catalog.
 * @example buildTitleIndex([{ id: 'a', title: 'A', altTitles: ['B'] }]) // [{ idMangaPlugin: 'a', title: 'A', forms: [...] }]
 */
export function buildTitleIndex(catalog) {
	return catalog.map((item) => ({
		idMangaPlugin: String(item.id),
		title: item.title,
		forms: toTitleForms([item.title, ...(item.altTitles ?? [])]),
	}));
}

/**
 * Best trigram similarity between any of `candidate` and `references`;
 * `longOnly` skips every pair with a short side.
 * @example bestFormSimilarity(toTitleForms(['A b']), toTitleForms(['A b'])) // 1
 */
export function bestFormSimilarity(candidate, references, longOnly = false) {
	let best = 0;
	for (const item of candidate) {
		for (const reference of references) {
			if (longOnly && !(item.long && reference.long)) continue;
			best = Math.max(best, gramSimilarity(item.grams, reference.grams));
		}
	}
	return best;
}

function toTitleSuggestion(idPlugin, entry, titleSimilarity) {
	return {
		idPlugin,
		idMangaPlugin: entry.idMangaPlugin,
		titlePlugin: entry.title,
		dSimilarity: null,
		pSimilarity: null,
		titleSimilarity,
		score: null,
		band: 'possible',
		origin: 'title',
		conflict: false,
	};
}

/**
 * The top `titleTopN` catalog items whose long titles reach `titleEntry`,
 * skipping cover candidates and items linked to any manga (alt-titles AC 28-30).
 * @example selectTitleSuggestions({ idPlugin, index, references, skipIds, config }) // [{ origin: 'title', ... }]
 */
export function selectTitleSuggestions({
	idPlugin,
	index,
	references,
	skipIds,
	config,
}) {
	return index
		.filter((entry) => !skipIds.has(entry.idMangaPlugin))
		.map((entry) => ({
			entry,
			similarity: bestFormSimilarity(entry.forms, references, true),
		}))
		.filter(({ similarity }) => similarity >= config.titleEntry)
		.toSorted((a, b) => b.similarity - a.similarity)
		.slice(0, config.titleTopN)
		.map(({ entry, similarity }) =>
			toTitleSuggestion(idPlugin, entry, similarity),
		);
}

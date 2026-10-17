import { maxDistanceFor, similarity } from './hashing.js';
import { bestTitleSimilarity } from './titleSimilarity.js';

/**
 * Matching thresholds from the env (`COVER_MATCH_*`).
 * @example matchConfigFrom(CONFIG_ENV) // { strong: 0.9, possible: 0.8, genericLimit: 10, topN: 3 }
 */
export function matchConfigFrom(env) {
	return {
		strong: env.COVER_MATCH_STRONG,
		possible: env.COVER_MATCH_POSSIBLE,
		genericLimit: env.COVER_MATCH_GENERIC_LIMIT,
		topN: env.COVER_MATCH_TOP_N,
	};
}

function bandOf(score, config) {
	if (score >= config.strong) return 'strong';
	if (score >= config.possible) return 'possible';
	return null;
}

const byScoreThenTitle = (a, b) =>
	b.score - a.score || b.titleSimilarity - a.titleSimilarity;

function withBand(candidate, config) {
	const score = Math.max(candidate.dSimilarity, candidate.pSimilarity);
	return { ...candidate, score, band: bandOf(score, config) };
}

/**
 * Suggestions of one manga x connector: the top N non-conflicting matches
 * (only strong ones when the cover is generic) plus every conflicting one.
 * @example selectSuggestions([{ dSimilarity: 0.95, pSimilarity: 0.7, titleSimilarity: 0, conflict: false }], config) // [{ ..., band: 'strong' }]
 */
export function selectSuggestions(candidates, config) {
	const matched = candidates
		.map((candidate) => withBand(candidate, config))
		.filter((candidate) => candidate.band);
	const conflicts = matched.filter((candidate) => candidate.conflict);
	const free = matched.filter((candidate) => !candidate.conflict);
	const kept =
		free.length > config.genericLimit
			? free.filter((candidate) => candidate.band === 'strong')
			: free;
	return [
		...kept.toSorted(byScoreThenTitle).slice(0, config.topN),
		...conflicts.toSorted(byScoreThenTitle),
	];
}

function bestAgainst(references, field, hash) {
	return Math.max(
		...references.map((reference) => similarity(reference[field], hash)),
	);
}

/**
 * Builds the matcher that turns the hash index into pending suggestions.
 * @example await createMatcher(deps).matchManga({ idManga: 7, title: 'Solo Leveling' })
 */
export function createMatcher({
	getConfig,
	listConnectorIds,
	listConnectorsByManga,
	hashes,
	suggestions,
	readLocalCover,
	hashImage,
	loadCatalog,
	logger,
}) {
	async function referencesOf(idManga, links) {
		const indexed = await hashes.listHashedItems(
			links.map(({ idPlugin, idMangaPlugin }) => ({ idPlugin, idMangaPlugin })),
		);
		if (indexed.length) return indexed;
		const localCover = await readLocalCover(idManga);
		return localCover ? [await hashImage(localCover)] : [];
	}

	async function catalogTitles(idPlugin) {
		const catalog = (await loadCatalog(idPlugin)) ?? [];
		return new Map(catalog.map((item) => [String(item.id), item.title]));
	}

	async function candidatesFor(idPlugin, references, referenceTitles) {
		const rows = await hashes.findCandidates({
			idPlugin,
			references,
			maxDistance: maxDistanceFor(getConfig().possible),
		});
		const titles = await catalogTitles(idPlugin);
		return rows.map((row) => {
			const titlePlugin = titles.get(row.idMangaPlugin) ?? row.idMangaPlugin;
			return {
				idPlugin,
				idMangaPlugin: row.idMangaPlugin,
				titlePlugin,
				dSimilarity: bestAgainst(references, 'dHash', row.dHash),
				pSimilarity: bestAgainst(references, 'pHash', row.pHash),
				titleSimilarity: bestTitleSimilarity(titlePlugin, referenceTitles),
				conflict: row.linkedIdManga !== null && row.linkedIdManga !== undefined,
			};
		});
	}

	function missingConnectors(links) {
		const linked = new Set(links.map((link) => link.idPlugin.toLowerCase()));
		return listConnectorIds().filter((id) => !linked.has(id.toLowerCase()));
	}

	async function matchManga({ idManga, title }) {
		const links = await listConnectorsByManga({ idManga });
		const references = await referencesOf(idManga, links);
		if (!references.length) return [];
		const referenceTitles = [title, ...links.map((link) => link.titlePlugin)];
		const selected = [];
		for (const idPlugin of missingConnectors(links)) {
			const candidates = await candidatesFor(
				idPlugin,
				references,
				referenceTitles,
			);
			selected.push(...selectSuggestions(candidates, getConfig()));
		}
		await suggestions.replacePending({ idManga, suggestions: selected });
		return selected;
	}

	async function matchAll() {
		const mangas = await suggestions.listMangasMissingConnectors({
			connectorIds: listConnectorIds(),
		});
		for (const manga of mangas) {
			await matchManga(manga).catch((error) =>
				logger.error({
					status: 'matching_falhou',
					idManga: manga.idManga,
					error: error.message,
				}),
			);
		}
	}

	return { matchManga, matchAll };
}

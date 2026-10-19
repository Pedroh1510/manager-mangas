import { maxDistanceFor, similarity } from './hashing.js';
import {
	bestFormSimilarity,
	buildTitleIndex,
	selectTitleSuggestions,
	toTitleForms,
} from './titleMatching.js';

/**
 * Matching thresholds from the env (`COVER_MATCH_*`, `TITLE_MATCH_*`).
 * @example matchConfigFrom(CONFIG_ENV) // { strong: 0.9, possible: 0.8, genericLimit: 10, topN: 3, titleEntry: 0.9, titlePromote: 0.8, titleTopN: 1 }
 */
export function matchConfigFrom(env) {
	return {
		strong: env.COVER_MATCH_STRONG,
		possible: env.COVER_MATCH_POSSIBLE,
		genericLimit: env.COVER_MATCH_GENERIC_LIMIT,
		topN: env.COVER_MATCH_TOP_N,
		titleEntry: env.TITLE_MATCH_ENTRY,
		titlePromote: env.TITLE_MATCH_PROMOTE,
		titleTopN: env.TITLE_MATCH_TOP_N,
	};
}

function bandOf(score, config) {
	if (score >= config.strong) return 'strong';
	if (score >= config.possible) return 'possible';
	return null;
}

const byScoreThenTitle = (a, b) =>
	b.score - a.score || b.titleSimilarity - a.titleSimilarity;

// A possible cover match whose title also agrees is promoted (alt-titles AC 26).
function withBand(candidate, config) {
	const score = Math.max(candidate.dSimilarity, candidate.pSimilarity);
	const band = bandOf(score, config);
	const promoted =
		band === 'possible' && candidate.titleSimilarity >= config.titlePromote;
	return promoted
		? { ...candidate, score, band: 'strong', origin: 'both' }
		: { ...candidate, score, band, origin: 'cover' };
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
 * Builds the matcher that turns the hash index and the titles into pending
 * suggestions.
 * @example await createMatcher(deps).matchManga({ idManga: 7, title: 'Solo Leveling', altTitles: [] })
 */
export function createMatcher({
	getConfig,
	listConnectorIds,
	listConnectorsByManga,
	listLinksByPlugin,
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

	async function loadContext(idPlugin) {
		const index = buildTitleIndex((await loadCatalog(idPlugin)) ?? []);
		const linked = await listLinksByPlugin({ idPlugin });
		return {
			index,
			byId: new Map(index.map((entry) => [entry.idMangaPlugin, entry])),
			linkedIds: new Set(linked.map((link) => String(link.idMangaPlugin))),
		};
	}

	// One catalog read and title index per connector for the whole matchAll
	// run, not per manga (alt-titles AC 33).
	function contextOf(idPlugin, contexts) {
		if (!contexts.has(idPlugin)) contexts.set(idPlugin, loadContext(idPlugin));
		return contexts.get(idPlugin);
	}

	async function coverCandidates(
		idPlugin,
		references,
		context,
		referenceForms,
	) {
		if (!references.length) return [];
		const rows = await hashes.findCandidates({
			idPlugin,
			references,
			maxDistance: maxDistanceFor(getConfig().possible),
		});
		return rows.map((row) => {
			const entry = context.byId.get(row.idMangaPlugin);
			return {
				idPlugin,
				idMangaPlugin: row.idMangaPlugin,
				titlePlugin: entry?.title ?? row.idMangaPlugin,
				dSimilarity: bestAgainst(references, 'dHash', row.dHash),
				pSimilarity: bestAgainst(references, 'pHash', row.pHash),
				titleSimilarity: entry
					? bestFormSimilarity(entry.forms, referenceForms)
					: 0,
				conflict: row.linkedIdManga !== null && row.linkedIdManga !== undefined,
			};
		});
	}

	async function suggestionsFor(
		idPlugin,
		references,
		referenceForms,
		contexts,
	) {
		const config = getConfig();
		const context = await contextOf(idPlugin, contexts);
		const candidates = await coverCandidates(
			idPlugin,
			references,
			context,
			referenceForms,
		);
		const skipIds = new Set([
			...context.linkedIds,
			...candidates.map((candidate) => candidate.idMangaPlugin),
		]);
		return [
			...selectSuggestions(candidates, config),
			...selectTitleSuggestions({
				idPlugin,
				index: context.index,
				references: referenceForms,
				skipIds,
				config,
			}),
		];
	}

	function missingConnectors(links) {
		const linked = new Set(links.map((link) => link.idPlugin.toLowerCase()));
		return listConnectorIds().filter((id) => !linked.has(id.toLowerCase()));
	}

	async function matchManga(
		{ idManga, title, altTitles = [] },
		contexts = new Map(),
	) {
		const links = await listConnectorsByManga({ idManga });
		const references = await referencesOf(idManga, links);
		const referenceForms = toTitleForms([
			title,
			...altTitles,
			...links.map((link) => link.titlePlugin),
		]);
		const selected = [];
		for (const idPlugin of missingConnectors(links)) {
			selected.push(
				...(await suggestionsFor(
					idPlugin,
					references,
					referenceForms,
					contexts,
				)),
			);
		}
		await suggestions.replacePending({ idManga, suggestions: selected });
		return selected;
	}

	async function matchAll() {
		const mangas = await suggestions.listMangasMissingConnectors({
			connectorIds: listConnectorIds(),
		});
		const contexts = new Map();
		for (const manga of mangas) {
			await matchManga(manga, contexts).catch((error) =>
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

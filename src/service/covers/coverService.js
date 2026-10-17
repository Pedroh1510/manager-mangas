import { createNegativeCache } from './negativeCache.js';

const FAILURE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Ids whose catalog cover file no longer matches the catalog: dropped from
 * it, or pointing at a different coverUrl.
 * @example staleCoverIds([{ id: 'a', coverUrl: 'u1' }], [{ id: 'a', coverUrl: 'u2' }]) // ['a']
 * @param {Array<{id: string, coverUrl?: string}>} previous
 * @param {Array<{id: string, coverUrl?: string}>} next
 * @returns {string[]}
 */
export function staleCoverIds(previous, next) {
	const nextCover = new Map(next.map((manga) => [manga.id, manga.coverUrl]));
	return previous
		.filter(
			(manga) =>
				!nextCover.has(manga.id) || nextCover.get(manga.id) !== manga.coverUrl,
		)
		.map((manga) => manga.id);
}

function oldestActiveFirst(connectors) {
	return connectors
		.filter((connector) => connector.isActive)
		.toSorted((a, b) => a.idMangaConnector - b.idMangaConnector);
}

/**
 * Builds the cover service over injected storage, catalog and network.
 * `getCatalogCover` serves the wizard; `getLocalCover` serves a registered
 * manga and fixes its cover on first success.
 * @example const cover = await coverService.getLocalCover({ idManga: 7 }); // Buffer or null
 */
export function createCoverService({
	paths,
	store,
	downloadCover,
	withDomainSlot,
	loadCatalog,
	listConnectorsByManga,
	now = Date.now,
	logger,
}) {
	const catalogFailures = createNegativeCache({ ttlMs: FAILURE_TTL_MS, now });
	const mangaFailures = createNegativeCache({ ttlMs: FAILURE_TTL_MS, now });

	async function findCoverUrl(pluginId, idMangaPlugin) {
		const catalog = await loadCatalog(pluginId);
		const item = catalog?.find((manga) => manga.id === idMangaPlugin);
		return item?.coverUrl ?? null;
	}

	async function download(coverUrl, context) {
		try {
			return await withDomainSlot(coverUrl, () => downloadCover(coverUrl));
		} catch (error) {
			logger.warn({
				status: 'capa_falhou',
				...context,
				coverUrl,
				error: error.message,
			});
			return null;
		}
	}

	// `hasSource` tells a failed or remembered download apart from a catalog
	// that has no coverUrl yet; only the first may be remembered as a failure.
	async function resolveCatalogCover({ pluginId, idMangaPlugin }) {
		const coverPath = paths.catalogCover(pluginId, idMangaPlugin);
		const cached = await store.read(coverPath);
		if (cached) return { cover: cached, hasSource: true };
		const failureKey = `${pluginId}\u0000${idMangaPlugin}`;
		if (catalogFailures.has(failureKey))
			return { cover: null, hasSource: true };
		const coverUrl = await findCoverUrl(pluginId, idMangaPlugin);
		if (!coverUrl) return { cover: null, hasSource: false };
		const cover = await download(coverUrl, { pluginId, idMangaPlugin });
		if (cover) await store.write(coverPath, cover);
		else catalogFailures.add(failureKey);
		return { cover, hasSource: true };
	}

	async function getCatalogCover(key) {
		const { cover } = await resolveCatalogCover(key);
		return cover;
	}

	async function firstConnectorCover(idManga) {
		const connectors = oldestActiveFirst(
			await listConnectorsByManga({ idManga }),
		);
		let hasSource = false;
		for (const { idPlugin, idMangaPlugin } of connectors) {
			const result = await resolveCatalogCover({
				pluginId: idPlugin,
				idMangaPlugin,
			});
			if (result.cover) return result;
			hasSource ||= result.hasSource;
		}
		return { cover: null, hasSource };
	}

	async function getLocalCover({ idManga }) {
		const localPath = paths.localCover(idManga);
		const stored = await store.read(localPath);
		if (stored) return stored;
		if (mangaFailures.has(idManga)) return null;
		const { cover, hasSource } = await firstConnectorCover(idManga);
		if (cover) {
			await store.write(localPath, cover);
			return cover;
		}
		// No connector has a coverUrl yet (e.g. a catalog still in the legacy
		// format right after deploy): nothing failed, so nothing to remember.
		if (hasSource) mangaFailures.add(idManga);
		return null;
	}

	// A new link is new information, so it gets a fresh attempt even while
	// an earlier failure for the same manga is still remembered.
	function refreshLocalCover({ idManga }) {
		mangaFailures.forget(idManga);
		return getLocalCover({ idManga });
	}

	async function dropStaleCatalogCovers(pluginId, previous, next) {
		const ids = staleCoverIds(previous, next);
		await Promise.all(
			ids.map((id) => store.remove(paths.catalogCover(pluginId, id))),
		);
	}

	return {
		getCatalogCover,
		getLocalCover,
		refreshLocalCover,
		dropStaleCatalogCovers,
	};
}

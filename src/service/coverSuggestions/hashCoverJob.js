import { countPipelineEvent } from '../../infra/telemetry/business.js';

/**
 * Builds the `hashCover` job: hash the cached catalog cover, or download it
 * inside the domain slot and cache it first; a failure is recorded, never
 * thrown, so BullMQ does not retry on top of the backoff.
 * @example await createHashCoverJob(deps)({ idPlugin: 'mangeek', idMangaPlugin: '1', coverUrl: 'https://h/a.jpg' })
 */
export function createHashCoverJob({
	paths,
	store,
	downloadCover,
	withDomainSlot,
	hashImage,
	hashes,
	now = Date.now,
	logger,
	countEvent = countPipelineEvent,
}) {
	async function loadCover({ idPlugin, idMangaPlugin, coverUrl }) {
		const coverPath = paths.catalogCover(idPlugin, idMangaPlugin);
		const cached = await store.read(coverPath);
		if (cached) return cached;
		const cover = await withDomainSlot(coverUrl, () => downloadCover(coverUrl));
		await store.write(coverPath, cover);
		return cover;
	}

	async function recordFailure(item, error) {
		await hashes.recordFailure({ ...item, failedAt: new Date(now()) });
		logger.warn({ status: 'hash_capa_falhou', ...item, error: error.message });
	}

	return async function hashCover({ idPlugin, idMangaPlugin, coverUrl }) {
		const item = { idPlugin, idMangaPlugin, coverUrl };
		let hashed;
		try {
			hashed = await hashImage(await loadCover(item));
		} catch (error) {
			countEvent('mangas.covers.hashed', { source: idPlugin, result: 'fail' });
			await recordFailure(item, error);
			return;
		}
		await hashes.upsertHash({ ...item, ...hashed, hashedAt: new Date(now()) });
		countEvent('mangas.covers.hashed', { source: idPlugin, result: 'ok' });
	};
}

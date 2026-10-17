const key = (idPlugin, idMangaPlugin) => `${idPlugin}\u0000${idMangaPlugin}`;

/**
 * In-memory `catalogCoverHashes` with the repository's interface; distance
 * filtering is left to the caller, so every hashed row is a candidate.
 * @example const hashes = new FakeCatalogCoverHashes([{ idPlugin: 'x', idMangaPlugin: 'a', coverUrl: 'u', dHash: 1n, pHash: 2n }]);
 */
export default class FakeCatalogCoverHashes {
	constructor(rows = []) {
		this.rows = new Map(
			rows.map((row) => [
				key(row.idPlugin, row.idMangaPlugin),
				{
					failureCount: 0,
					failedAt: null,
					linkedIdManga: null,
					linkedTitle: null,
					...row,
				},
			]),
		);
	}

	row(idPlugin, idMangaPlugin) {
		return this.rows.get(key(idPlugin, idMangaPlugin)) ?? null;
	}

	listByPlugin = async ({ idPlugin }) =>
		[...this.rows.values()].filter((row) => row.idPlugin === idPlugin);

	listHashedItems = async (items) =>
		items
			.map((item) => this.row(item.idPlugin, item.idMangaPlugin))
			.filter((row) => row && row.dHash !== null);

	upsertHash = async ({
		idPlugin,
		idMangaPlugin,
		coverUrl,
		dHash,
		pHash,
		hashedAt,
	}) => {
		this.rows.set(key(idPlugin, idMangaPlugin), {
			...(this.row(idPlugin, idMangaPlugin) ?? {}),
			idPlugin,
			idMangaPlugin,
			coverUrl,
			dHash,
			pHash,
			hashedAt,
			failureCount: 0,
			failedAt: null,
		});
	};

	recordFailure = async ({ idPlugin, idMangaPlugin, coverUrl, failedAt }) => {
		const previous = this.row(idPlugin, idMangaPlugin);
		const failureCount =
			previous?.coverUrl === coverUrl ? previous.failureCount + 1 : 1;
		this.rows.set(key(idPlugin, idMangaPlugin), {
			...(previous ?? {}),
			idPlugin,
			idMangaPlugin,
			coverUrl,
			dHash: null,
			pHash: null,
			failureCount,
			failedAt,
		});
	};

	deleteMissing = async ({ idPlugin, keepIds }) => {
		const keep = new Set(keepIds);
		const removed = [];
		for (const row of [...this.rows.values()]) {
			if (row.idPlugin !== idPlugin || keep.has(row.idMangaPlugin)) continue;
			this.rows.delete(key(idPlugin, row.idMangaPlugin));
			removed.push(row.idMangaPlugin);
		}
		return removed;
	};

	findCandidates = async ({ idPlugin }) =>
		[...this.rows.values()].filter(
			(row) => row.idPlugin === idPlugin && row.dHash !== null,
		);
}

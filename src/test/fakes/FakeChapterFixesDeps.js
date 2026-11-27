/**
 * Records calls made by createChapterFixes. Build deps with `.asDeps()`.
 * @example const deps = new FakeChapterFixesDeps({ chapter }); createChapterFixes(deps.asDeps())
 */
export default class FakeChapterFixesDeps {
	inserted = [];
	deleted = [];
	scanned = [];
	unblockedCount = 1;
	deleteError = null;
	#idsByPair = new Map();

	constructor({ chapter = null, scanResult = true } = {}) {
		this.chapter = chapter;
		this.scanResult = scanResult;
	}

	asDeps() {
		return {
			chapters: { findChapterById: async () => this.chapter },
			blocked: {
				insertBlocked: async (row) => {
					this.inserted.push(row);
					const pair = `${row.idMangaConnector}:${row.idChapterPlugin}`;
					if (!this.#idsByPair.has(pair)) {
						this.#idsByPair.set(pair, 7 + this.#idsByPair.size);
					}
					return { idBlockedChapter: this.#idsByPair.get(pair) };
				},
				listBlockedByManga: async () => [],
				deleteBlocked: async () => this.unblockedCount,
			},
			deleteChapter: async (params) => {
				if (this.deleteError) throw this.deleteError;
				this.deleted.push(params);
			},
			scanSeries: async (params) => {
				this.scanned.push(params);
				return this.scanResult;
			},
		};
	}
}

/**
 * Records calls made by createChapterFixes. Build deps with `.asDeps()`.
 * @example const deps = new FakeChapterFixesDeps({ chapter }); createChapterFixes(deps.asDeps())
 */
export default class FakeChapterFixesDeps {
	inserted = [];
	deleted = [];
	scanned = [];
	unblockedCount = 1;

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
					return { idBlockedChapter: 7 };
				},
				listBlockedByManga: async () => [],
				deleteBlocked: async () => this.unblockedCount,
			},
			deleteChapter: async (params) => {
				this.deleted.push(params);
			},
			scanSeries: async (params) => {
				this.scanned.push(params);
				return this.scanResult;
			},
		};
	}
}

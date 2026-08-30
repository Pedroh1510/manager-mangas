/**
 * Flatten Kavita chapters across all volumes into a single array.
 * @param {Array<{chapters?: Object[]}>} volumes - Array of volume objects with chapters
 * @returns {Object[]} Flat array of all chapters across all volumes
 *
 * Example:
 *   flattenKavitaChapters([
 *     { chapters: [{ minNumber: 1 }, { minNumber: 2 }] },
 *     { chapters: [{ minNumber: 3 }] }
 *   ])
 *   // => [{ minNumber: 1 }, { minNumber: 2 }, { minNumber: 3 }]
 */
export function flattenKavitaChapters(volumes) {
	return volumes.flatMap((volume) => volume.chapters ?? []);
}

function sameChapterNumber(localVolume, kavitaMinNumber) {
	return Number(localVolume).toFixed(4) === Number(kavitaMinNumber).toFixed(4);
}

function isFullyRead(kavitaChapter) {
	return (
		kavitaChapter.pages > 0 && kavitaChapter.pagesRead >= kavitaChapter.pages
	);
}

function findKavitaChapter({ volume, kavitaChapters }) {
	const matches = kavitaChapters.filter((chapter) =>
		sameChapterNumber(volume, chapter.minNumber),
	);
	// An ambiguous match (more than one Kavita chapter sharing the same
	// number, e.g. multiple specials at minNumber: 0) is treated the same
	// as no match: never delete based on another chapter's read state.
	if (matches.length !== 1) return null;
	return matches[0];
}

/**
 * Identify chapters eligible for deletion.
 *
 * A chapter is eligible only if ALL of:
 * 1. It is downloaded (downloadedAt is set)
 * 2. It has a matching Kavita chapter (by numeric volume equality)
 * 3. It is fully read (pagesRead >= pages, where pages > 0)
 * 4. It is NOT the highest volume AMONG THE ELIGIBLE chapters
 *
 * The "highest" is computed only among eligible (downloaded + matched + fully-read)
 * chapters, NOT all local chapters. This prevents ineligible higher-volume chapters
 * from affecting the safety rule that the highest-read chapter is always kept.
 *
 * @param {Object} params
 * @param {Array} params.localChapters - Array of local chapter objects
 * @param {Array} params.kavitaChapters - Array of Kavita chapter objects
 * @returns {Object[]} Chapters that may be safely deleted
 *
 * Example:
 *   selectChaptersToDelete({
 *     localChapters: [
 *       { idChapter: 1, volume: '1.0000', downloadedAt: new Date() },
 *       { idChapter: 2, volume: '2.0000', downloadedAt: new Date() }
 *     ],
 *     kavitaChapters: [
 *       { minNumber: 1, pages: 20, pagesRead: 20 },
 *       { minNumber: 2, pages: 20, pagesRead: 20 }
 *     ]
 *   })
 *   // => [{ idChapter: 1, volume: '1.0000', ... }]  // Only chapter 1 deleted; chapter 2 kept
 */
export function selectChaptersToDelete({ localChapters, kavitaChapters }) {
	const fullyReadChapters = localChapters.filter((chapter) => {
		if (!chapter.downloadedAt) return false;
		const kavitaChapter = findKavitaChapter({
			volume: chapter.volume,
			kavitaChapters,
		});
		return kavitaChapter !== null && isFullyRead(kavitaChapter);
	});
	if (fullyReadChapters.length === 0) return [];

	const highestVolume = Math.max(
		...fullyReadChapters.map((chapter) => Number(chapter.volume)),
	);
	return fullyReadChapters.filter(
		(chapter) => Number(chapter.volume) !== highestVolume,
	);
}

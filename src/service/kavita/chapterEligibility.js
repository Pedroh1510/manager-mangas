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

function sameChapterNumber(localVolume, kavitaChapterNumber) {
	return (
		Number(localVolume).toFixed(4) === Number(kavitaChapterNumber).toFixed(4)
	);
}

// Kavita's sentinel for "couldn't parse a chapter number": every chapter it
// treats as a loose special (no volume folder to infer numbering from) gets
// this exact minNumber, even when its real number is obvious from the
// filename. The real number then lives in `title`/`range` instead
// (e.g. minNumber: -100000, title: "13.0000").
const UNPARSED_NUMBER_SENTINEL = -100000;

function effectiveChapterNumber(kavitaChapter) {
	if (kavitaChapter.minNumber !== UNPARSED_NUMBER_SENTINEL) {
		return kavitaChapter.minNumber;
	}
	const fromTitle = Number(kavitaChapter.title ?? kavitaChapter.range);
	return Number.isFinite(fromTitle) ? fromTitle : kavitaChapter.minNumber;
}

function isFullyRead(kavitaChapter) {
	return (
		kavitaChapter.pages > 0 && kavitaChapter.pagesRead >= kavitaChapter.pages
	);
}

// Kavita can list the same chapter number twice under a slightly different
// title (e.g. "1" and "1.0000") after a rescan. Only collapse these into one
// match when every copy agrees on pages/pagesRead - a real disagreement
// (different read state) must still be treated as ambiguous.
function isIdenticalDuplicateGroup(matches) {
	const [first, ...rest] = matches;
	return rest.every(
		(chapter) =>
			chapter.pages === first.pages && chapter.pagesRead === first.pagesRead,
	);
}

function findKavitaChapter({ volume, kavitaChapters }) {
	const matches = kavitaChapters.filter((chapter) =>
		sameChapterNumber(volume, effectiveChapterNumber(chapter)),
	);
	if (matches.length === 0) return null;
	if (matches.length === 1) return matches[0];
	// A genuinely ambiguous match (more than one Kavita chapter sharing the
	// same number with different read state) is treated the same as no
	// match: never delete based on another chapter's read state.
	return isIdenticalDuplicateGroup(matches) ? matches[0] : null;
}

function hasLocalChapter({ kavitaChapter, localChapters }) {
	return localChapters.some((chapter) =>
		sameChapterNumber(chapter.volume, effectiveChapterNumber(kavitaChapter)),
	);
}

/**
 * Identify Kavita chapters with no corresponding row in the local
 * `chapters` table (e.g. manually scanned into Kavita, or belonging to a
 * manga not tracked in our database at all). Eligible only if fully read
 * and unambiguous, same safety rule as `findKavitaChapter`.
 * @returns {Object[]} Synthetic chapter objects (idChapter: null) ready to
 * flow through the same highest-volume filter as local chapters.
 */
function selectOrphanChapters({ localChapters, kavitaChapters }) {
	const orphans = [];
	const seenNumbers = new Set();
	for (const kavitaChapter of kavitaChapters) {
		const number = effectiveChapterNumber(kavitaChapter);
		const key = Number(number).toFixed(4);
		if (seenNumbers.has(key)) continue;
		seenNumbers.add(key);

		const match = findKavitaChapter({ volume: number, kavitaChapters });
		if (!match || !isFullyRead(match)) continue;
		if (hasLocalChapter({ kavitaChapter: match, localChapters })) continue;

		orphans.push({ idChapter: null, volume: effectiveChapterNumber(match) });
	}
	return orphans;
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
 * Kavita chapters with no local row at all (orphans - e.g. manually scanned,
 * or belonging to a manga we don't track) are eligible under the same
 * fully-read rule, and count toward the same highest-volume safety check:
 * an orphan can only be deleted if it isn't the highest volume overall.
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
	const localEligible = localChapters.filter((chapter) => {
		if (!chapter.downloadedAt) return false;
		const kavitaChapter = findKavitaChapter({
			volume: chapter.volume,
			kavitaChapters,
		});
		return kavitaChapter !== null && isFullyRead(kavitaChapter);
	});
	const orphanEligible = selectOrphanChapters({ localChapters, kavitaChapters });

	const eligible = [...localEligible, ...orphanEligible];
	if (eligible.length === 0) return [];

	const highestVolume = Math.max(
		...eligible.map((chapter) => Number(chapter.volume)),
	);
	return eligible.filter((chapter) => Number(chapter.volume) !== highestVolume);
}

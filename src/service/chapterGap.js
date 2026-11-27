import { toVolumeKey } from '../utils/chapterFormat.js';

/**
 * Gap rule for chapter discovery: a whole volume is "held" when a whole
 * volume at least two numbers below it is known, meaning a volume between
 * them was skipped. Decimal volumes (e.g. 171.5) are never held and never
 * count as known fillers, because they are side stories, not sequence steps.
 *
 * @example
 * findGap({ volume: '177', knownVolumeKeys: new Set(['170', '171']) })
 * // { isHeld: true, previousKnownVolume: 171 }
 */
export function findGap({ volume, knownVolumeKeys }) {
	const current = Number(volume);
	if (!Number.isInteger(current)) {
		return { isHeld: false, previousKnownVolume: null };
	}
	const previousKnownVolume = findPreviousIntegerKey(current, knownVolumeKeys);
	const isHeld =
		previousKnownVolume !== null && previousKnownVolume < current - 1;
	return { isHeld, previousKnownVolume };
}

function findPreviousIntegerKey(current, knownVolumeKeys) {
	let previous = null;
	for (const key of knownVolumeKeys) {
		const value = Number(key);
		if (!Number.isInteger(value) || value >= current) continue;
		if (previous === null || value > previous) previous = value;
	}
	return previous;
}

/**
 * Key identifying one chapter of one link in the blocked set.
 * @example blockKey({ idMangaConnector: 3 }, { id: 'abc' }) // '3:abc'
 */
export function blockKey({ idMangaConnector }, { id }) {
	return `${idMangaConnector}:${id}`;
}

/**
 * Discovers chapters across links in two passes. Pass 1 records, per link and
 * as soon as it answers, every volume that is not behind a gap against the
 * database. Gap volumes are deferred; pass 2 re-checks them against the
 * database plus everything the answering links listed, so another link
 * filling the gap releases them. A deferred volume that at least two links
 * list is released by corroboration even if the gap stays open (spec §2).
 * Volumes still held are reported once per volume.
 *
 * @example
 * const { recorded, outcomes } = await planDiscovery({
 *   links, storedVolumeKeys, blockedKeys, listLinkChapters, recordChapter, reportHeld,
 * });
 * @param {{
 *   links: Array<{ idMangaConnector: number, idPlugin: string }>,
 *   storedVolumeKeys: Set<string>,
 *   blockedKeys: Set<string>,
 *   listLinkChapters: (link: object) => Promise<Array<{ id: string, title: string, volume: string }>>,
 *   recordChapter: (args: { link: object, chapter: object }) => Promise<object|null>,
 *   reportHeld: (args: { link: object, chapter: object, previousKnownVolume: number }) => void,
 * }} params
 * @returns {Promise<{ recorded: object[], outcomes: PromiseSettledResult[] }>}
 */
export async function planDiscovery(params) {
	const outcomes = await Promise.allSettled(
		params.links.map((link) => scanLink(params, link)),
	);
	const scans = outcomes
		.filter((outcome) => outcome.status === 'fulfilled')
		.map((outcome) => outcome.value);
	const context = {
		...collectListings(params, scans),
		reportedKeys: new Set(),
	};
	const settled = [];
	const pass2 = await Promise.allSettled(
		scans.map((scan) =>
			settleDeferred(params, scan, { ...context, into: settled }),
		),
	);
	const failures = pass2.filter((outcome) => outcome.status === 'rejected');
	const recorded = [...scans.flatMap((scan) => scan.recorded), ...settled];
	return { recorded, outcomes: [...outcomes, ...failures] };
}

/**
 * Known volume keys (database plus every non-blocked listing) and, per key,
 * the distinct links that listed it.
 * @example collectListings({ storedVolumeKeys: new Set(['171']) }, scans)
 * // { known: Set{'171','177'}, listersByKey: Map{'177' => Set{1, 2}} }
 * @returns {{ known: Set<string>, listersByKey: Map<string, Set<number>> }}
 */
function collectListings(params, scans) {
	const known = new Set(params.storedVolumeKeys);
	const listersByKey = new Map();
	for (const scan of scans) {
		for (const key of scan.listedKeys) {
			known.add(key);
			const listers = listersByKey.get(key) ?? new Set();
			listersByKey.set(key, listers.add(scan.link.idMangaConnector));
		}
	}
	return { known, listersByKey };
}

async function scanLink(params, link) {
	const { storedVolumeKeys, blockedKeys } = params;
	const chapters = await params.listLinkChapters(link);
	const open = chapters.filter(
		(chapter) => !blockedKeys.has(blockKey(link, chapter)),
	);
	const scan = { link, recorded: [], deferred: [], listedKeys: [] };
	for (const chapter of open) {
		const key = toVolumeKey(chapter.volume);
		scan.listedKeys.push(key);
		if (storedVolumeKeys.has(key)) continue;
		const { isHeld } = findGap({
			volume: chapter.volume,
			knownVolumeKeys: storedVolumeKeys,
		});
		if (isHeld) scan.deferred.push(chapter);
		else await recordInto(params, scan.recorded, link, chapter);
	}
	return scan;
}

const MIN_CORROBORATING_LINKS = 2;

function isCorroborated(listersByKey, key) {
	return (listersByKey.get(key)?.size ?? 0) >= MIN_CORROBORATING_LINKS;
}

async function settleDeferred(params, scan, context) {
	const { known, listersByKey, reportedKeys, into } = context;
	for (const chapter of scan.deferred) {
		const key = toVolumeKey(chapter.volume);
		const { isHeld, previousKnownVolume } = findGap({
			volume: chapter.volume,
			knownVolumeKeys: known,
		});
		if (!isHeld || isCorroborated(listersByKey, key)) {
			await recordInto(params, into, scan.link, chapter);
			continue;
		}
		if (reportedKeys.has(key)) continue;
		reportedKeys.add(key);
		params.reportHeld({ link: scan.link, chapter, previousKnownVolume });
	}
}

async function recordInto(params, into, link, chapter) {
	const result = await params.recordChapter({ link, chapter });
	if (result) into.push(result);
}

/**
 * Structured warn payload for a held chapter (spec §2).
 * @example buildHeldLog({ idManga: 15, link, chapter, previousKnownVolume: 171 })
 * // { status: 'chapter_held_gap', idManga: 15, idPlugin: 'mangeek', ... }
 * @returns {{ status: string, idManga: number, idPlugin: string, idMangaConnector: number, idChapterPlugin: string, volume: string, previousKnownVolume: number }}
 */
export function buildHeldLog({ idManga, link, chapter, previousKnownVolume }) {
	return {
		status: 'chapter_held_gap',
		idManga,
		idPlugin: link.idPlugin,
		idMangaConnector: link.idMangaConnector,
		idChapterPlugin: chapter.id,
		volume: chapter.volume,
		previousKnownVolume,
	};
}

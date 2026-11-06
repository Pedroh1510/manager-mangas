import { createHash } from 'node:crypto';

// One- and two-page chapters (covers, notices) can legitimately repeat an
// image; from three pages on, all-identical bytes mean a stand-in image.
const MIN_PAGES_TO_JUDGE = 3;

/**
 * Raised when every page of a chapter is the same image: the source served an
 * anti-scraping banner instead of the real pages (Mangeek copied leituramanga's
 * "Leia esse capítulo no leituramanga.net" image into all 51 pages of
 * "Start With 13 Hidden Traits" ch. 54).
 */
export class PlaceholderChapterError extends Error {
	constructor({ manga, chapter, pageCount }) {
		super(
			`Capítulo placeholder: "${manga}" cap. ${chapter} tem ${pageCount} páginas idênticas, esperado imagens distintas por página`,
		);
		this.name = 'PlaceholderChapterError';
		this.manga = manga;
		this.chapter = chapter;
	}
}

/**
 * Fingerprints downloaded page bytes so identical pages can be spotted.
 * @param {Buffer} bytes
 * @returns {string}
 * @example hashPageBytes(Buffer.from('page')) // 'a3f…'
 */
export function hashPageBytes(bytes) {
	return createHash('sha1').update(bytes).digest('hex');
}

/**
 * Throws PlaceholderChapterError when a chapter long enough to judge has only
 * one distinct page hash.
 * @param {{ manga: string, chapter: string|number, hashes: string[] }} input
 * @returns {void}
 * @example assertNotPlaceholderChapter({ manga: 'M', chapter: 1, hashes: ['a', 'b', 'c'] })
 */
export function assertNotPlaceholderChapter({ manga, chapter, hashes }) {
	if (hashes.length < MIN_PAGES_TO_JUDGE) return;
	if (new Set(hashes).size > 1) return;
	throw new PlaceholderChapterError({
		manga,
		chapter,
		pageCount: hashes.length,
	});
}

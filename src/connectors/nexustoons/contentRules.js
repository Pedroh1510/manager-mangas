// Paid, licensed and text-only content is filtered at the source: the
// connector never lists what it cannot download (plan D3/D6).

/**
 * True for catalog entries the connector can download.
 * @example isDownloadableManga({ type: 'manhwa', isVipOnly: false, officialLink: '' }) // true
 * @param {{type?: string, isVipOnly?: boolean, officialLink?: string}} manga
 * @returns {boolean}
 */
export function isDownloadableManga(manga) {
	return !manga.isVipOnly && !manga.officialLink && manga.type !== 'novel';
}

/**
 * True for chapters readable without coins, VIP or waiting for release.
 * @example isFreeChapter({ accessLevel: 'public', coinCost: 0, releaseStatus: 'published' }) // true
 * @param {{accessLevel?: string, coinCost?: number, releaseStatus?: string}} chapter
 * @returns {boolean}
 */
export function isFreeChapter(chapter) {
	return (
		chapter.accessLevel === 'public' &&
		!chapter.coinCost &&
		chapter.releaseStatus === 'published'
	);
}

/**
 * Maps an API chapter to the connector contract shape.
 * @example toChapterEntry({ id: 7, number: '7', title: '' }) // { id: '7', title: 'Cap. 7', language: 'pt' }
 * @param {{id: number, number: string, title?: string}} chapter
 * @returns {{id: string, title: string, language: string}}
 */
export function toChapterEntry(chapter) {
	const label = `Cap. ${chapter.number}`;
	return {
		id: String(chapter.id),
		title: chapter.title ? `${label} - ${chapter.title}` : label,
		language: 'pt',
	};
}

/**
 * Throws when a chapter response cannot be turned into plain image urls.
 * @example assertPlainImageChapter('9', { contentType: 'images', pages: [] })
 * @param {string} chapterId
 * @param {{contentType?: string, requiresSession?: boolean, pages?: {dk?: string}[]}} reader
 */
export function assertPlainImageChapter(chapterId, reader) {
	if (reader.requiresSession) {
		throw new Error(
			`NexusToons: chapter ${chapterId} requires a Turnstile reading session, not supported`,
		);
	}
	if (reader.contentType !== 'images') {
		throw new Error(
			`NexusToons: chapter ${chapterId} has contentType "${reader.contentType}", expected "images"`,
		);
	}
	if (reader.pages?.some((page) => page.dk)) {
		throw new Error(
			`NexusToons: chapter ${chapterId} has encrypted page images (dk), not supported`,
		);
	}
}

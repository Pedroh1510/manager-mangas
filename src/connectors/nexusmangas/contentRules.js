// Licensed works and novels are filtered in the catalog query; what is left
// to check is per chapter, and only read-chapter knows it (plan AC 7/8).

/**
 * Maps an API chapter to the connector contract shape.
 * @example toChapterEntry({ id: 'c1', number: 7, title: 'Fim' }) // { id: 'c1', title: 'Cap. 7', language: 'pt' }
 * @param {{id: string, number: number}} chapter
 * @returns {{id: string, title: string, language: string}}
 */
export function toChapterEntry(chapter) {
	return {
		id: String(chapter.id),
		title: `Cap. ${chapter.number}`,
		language: 'pt',
	};
}

/**
 * Throws when a read-chapter response cannot be turned into image urls.
 * @example assertReadableChapter('c1', { access: { allowed: true }, chapter: { pages: ['u'] } })
 * @param {string} chapterId
 * @param {{access?: {allowed?: boolean, reason?: string}, chapter?: {is_novel?: boolean, pages?: string[]}}} reader
 */
export function assertReadableChapter(chapterId, reader) {
	if (reader.access?.allowed !== true) {
		throw new Error(
			`NexusMangas: chapter ${chapterId} is not readable without an account (reason: ${reader.access?.reason ?? 'unknown'})`,
		);
	}
	if (reader.chapter?.is_novel) {
		throw new Error(
			`NexusMangas: chapter ${chapterId} is a novel chapter, expected images`,
		);
	}
	if (!reader.chapter?.pages?.length) {
		throw new Error(`NexusMangas: chapter ${chapterId} has no page images`);
	}
}

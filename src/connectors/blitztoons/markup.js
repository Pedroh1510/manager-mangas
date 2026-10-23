const OBRA_HREF = /^\/obra\/([^/?#]+)/;
const CHAPTER_NUMBER = /^\d+$/;

/**
 * Reads every series card of an `/obras` listing page; `slug` is undefined
 * when the title link is not an `/obra/` path, so callers can still tell an
 * empty page (plan AC 1) from one with unreadable cards.
 * @example readCatalogCards(doc) // [{ slug: 'doutor-i-a', title: 'Doutor I.A', coverUrl: 'https://…webp' }]
 * @param {{select: Function}} doc parsed page
 * @returns {{slug: string | undefined, title: string, coverUrl: string}[]}
 */
export function readCatalogCards(doc) {
	return doc.select('article.card').map(readCatalogCard);
}

function readCatalogCard(card) {
	const [link] = card.select('h3.card-title a');
	const [cover] = card.select('.card-cover img');
	return {
		slug: link?.attr('href')?.match(OBRA_HREF)?.[1],
		title: link?.text() ?? '',
		coverUrl: cover?.attr('src') ?? '',
	};
}

/**
 * Reads the public chapter items of an `/obra/{slug}` page; VIP early-access
 * items are dropped (markup inferred from theme.css, plan open question 2).
 * @example readChapterItems(doc) // [{ dataNum: '164' }, { dataNum: '163' }]
 * @param {{select: Function}} doc parsed page
 * @returns {{dataNum: string}[]}
 */
export function readChapterItems(doc) {
	return doc
		.select('ul.chaplist li.chap')
		.filter((item) => !isLockedChapter(item))
		.map((item) => ({ dataNum: item.attr('data-num') ?? '' }));
}

function isLockedChapter(item) {
	return item.hasClass('chap-locked') || item.select('.lock-tag').length > 0;
}

/**
 * Chapter numbers on the site are non-negative integers; anything else is
 * markup we do not understand.
 * @example isChapterNumber('0') // true
 * @param {string} dataNum
 * @returns {boolean}
 */
export function isChapterNumber(dataNum) {
	return CHAPTER_NUMBER.test(dataNum);
}

/**
 * Reads the reader page images as absolute URLs, in document order.
 * @example readPageSources(doc, 'https://blitztoons.com') // ['https://cdn.blitztoons.com/chapters/879/163/001.webp?v=1']
 * @param {{select: Function}} doc parsed page
 * @param {string} baseUrl
 * @returns {string[]}
 */
export function readPageSources(doc, baseUrl) {
	return doc
		.select('img.page')
		.map((image) => image.attr('src'))
		.filter(Boolean)
		.map((src) => new URL(src, baseUrl).href);
}

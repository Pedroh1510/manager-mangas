import defaultLogger from '../../infra/logger.js';
import Connector from '../Connector.js';
import { parseHtmlDocument } from './htmlDocument.js';
import {
	isChapterNumber,
	readCatalogCards,
	readChapterItems,
	readPageSources,
} from './markup.js';

// No rate limit was observed; one request per second keeps the ~46 catalog
// pages under a minute without hammering the site (plan AC 12).
const REQUEST_DELAY_MS = 1000;
// 1088 works / 24 per page = 46 pages in 2026-10; the cap only guards against
// a listing that never returns an empty page (plan AC 4).
const CATALOG_PAGE_LIMIT = 200;
const REQUEST_RETRIES = 2;
const SERVER_ERROR_DELAY_MS = 5000;
const REQUEST_TIMEOUT_MS = 60_000;
// The CDN and site answer 403 to non-browser agents such as curl.
const BROWSER_USER_AGENT =
	'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';

export default class BlitzToons extends Connector {
	constructor({
		requestDelayMs = REQUEST_DELAY_MS,
		logger = defaultLogger,
	} = {}) {
		super({
			id: 'blitztoons',
			label: 'Blitz Toons',
			tags: ['manhwa', 'portuguese'],
			url: 'https://blitztoons.com',
		});
		this.requestDelayMs = requestDelayMs;
		this.logger = logger;
		this.lastRequestSlot = Promise.resolve();
	}

	async _getMangas() {
		const bySlug = new Map();
		for (let page = 1; page <= CATALOG_PAGE_LIMIT; page++) {
			const cards = await this._fetchCatalogPage(page);
			if (!cards.length) return [...bySlug.values()];
			for (const card of cards) {
				if (bySlug.has(card.slug)) continue;
				bySlug.set(
					card.slug,
					this._toCatalogEntry(card.slug, card.title, card.coverUrl),
				);
			}
		}
		throw new Error(
			`BlitzToons: catalog reached page ${CATALOG_PAGE_LIMIT} without an empty page, expected the listing to end within ${CATALOG_PAGE_LIMIT} pages`,
		);
	}

	async _getChapters(manga) {
		const doc = await this._fetchDocument(`/obra/${manga.id}`);
		return readChapterItems(doc)
			.filter(({ dataNum }) => this._isKnownChapterNumber(manga.id, dataNum))
			.map(({ dataNum }) => Number(dataNum))
			.sort((a, b) => a - b)
			.map((number) => ({
				id: `${manga.id}/${number}`,
				title: `Cap. ${number}`,
				language: 'pt',
			}));
	}

	async _getPages(chapter) {
		const doc = await this._fetchDocument(`/ler/${chapter.id}`);
		const pages = readPageSources(doc, this.url);
		if (!pages.length) {
			throw new Error(
				`BlitzToons: chapter ${chapter.id} has no pages, expected at least one img.page`,
			);
		}
		return pages;
	}

	async _fetchCatalogPage(page) {
		const query = new URLSearchParams({ ordem: 'alfabetica', p: String(page) });
		return readCatalogCards(await this._fetchDocument(`/obras?${query}`));
	}

	_isKnownChapterNumber(slug, dataNum) {
		if (isChapterNumber(dataNum)) return true;
		this.logger.warn(
			JSON.stringify({
				connector: this.id,
				event: 'blitztoons_chapter_skipped',
				slug,
				dataNum,
			}),
		);
		return false;
	}

	// Chains every request on the shared instance so concurrent jobs keep
	// requestDelayMs between requests instead of each waiting on its own.
	_waitForRequestSlot() {
		const slot = this.lastRequestSlot.then(() =>
			this.wait(this.requestDelayMs),
		);
		this.lastRequestSlot = slot;
		return slot;
	}

	async _fetchDocument(path, retriesLeft = REQUEST_RETRIES) {
		await this._waitForRequestSlot();
		const url = `${this.url}${path}`;
		const response = await fetch(this._buildRequest(url));
		if (response.status === 200)
			return parseHtmlDocument(await response.text());
		if (response.status >= 500 && retriesLeft > 0) {
			await this.wait(SERVER_ERROR_DELAY_MS);
			return this._fetchDocument(path, retriesLeft - 1);
		}
		throw new Error(
			`BlitzToons: GET ${url} answered ${response.status}, expected 200`,
		);
	}

	_buildRequest(url) {
		return new Request(url, {
			headers: { 'user-agent': BROWSER_USER_AGENT },
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
	}
}

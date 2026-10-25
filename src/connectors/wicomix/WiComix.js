import defaultLogger from '../../infra/logger.js';
import Connector from '../Connector.js';
import { parseHtmlDocument, parseXmlDocument } from '../htmlDocument.js';
import { createFileIndexStore } from './catalogIndex.js';
import { readComicPage } from './rscPayload.js';

// ~3057 works in 2026-10: one second per request keeps a full sweep under an
// hour without hammering the site; later sweeps only fetch changed works.
const REQUEST_DELAY_MS = 1000;
const REQUEST_RETRIES = 2;
const SERVER_ERROR_DELAY_MS = 5000;
const REQUEST_TIMEOUT_MS = 60_000;
// Saved this often so a retried refresh job resumes instead of restarting (plan AC 10).
const INDEX_CHECKPOINT_EVERY = 100;
// More failures than this share of the sitemap reads as a layout change (plan AC 13).
const MAX_FAILURE_RATIO = 0.1;
const MANGA_SITEMAP_PATH = /^\/sitemaps\/manga-\d+\.xml$/;
const MANGA_PATH = /^\/manga\/([^/?#]+)$/;
// Page images have moved between hosts and paths (/chapters/<slug>/<n>/,
// /temp/*.webp, cdn.noxmangas.org/paginas/ by 2026-10, #41), so the reader's
// pages <section> is the stable marker; the work cover sits outside it.
const PAGE_IMAGE_SELECTOR = 'section > img';
const BROWSER_USER_AGENT =
	'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';

export default class WiComix extends Connector {
	constructor({
		requestDelayMs = REQUEST_DELAY_MS,
		logger = defaultLogger,
		indexStore = createFileIndexStore(),
	} = {}) {
		super({
			id: 'wicomix',
			label: 'WiComix',
			tags: ['manhwa', 'portuguese'],
			url: 'https://loobyt.org',
		});
		this.requestDelayMs = requestDelayMs;
		this.logger = logger;
		this.indexStore = indexStore;
		this.lastRequestSlot = Promise.resolve();
	}

	async _getMangas() {
		const lastmods = await this._readSitemapLastmods();
		const entries = keepListedEntries(await this.indexStore.load(), lastmods);
		const run = { entries, fetched: 0, failures: 0 };
		for (const [slug, lastmod] of lastmods) {
			if (entries.get(slug)?.lastmod === lastmod) continue;
			await this._refreshEntry(run, slug, lastmod);
		}
		await this.indexStore.save(Object.fromEntries(entries));
		this._assertFailureRatio(run.failures, lastmods.size);
		return [...entries].filter(([, e]) => !e.novel).map(toCatalogEntry, this);
	}

	async _getChapters(manga) {
		const chapters = this._readComic(
			await this._fetchText(`/manga/${manga.id}`),
			manga.id,
		).chapters;
		return chapters
			.filter(isReadableChapter)
			.sort((a, b) => a.number - b.number)
			.map((chapter) => ({
				id: `${manga.id}/${chapter.slug}`,
				title: `Cap. ${chapter.number}`,
				language: 'pt',
			}));
	}

	async _getPages(chapter) {
		const doc = parseHtmlDocument(await this._fetchText(`/read/${chapter.id}`));
		const pages = doc
			.select(PAGE_IMAGE_SELECTOR)
			.map((image) => image.attr('src'))
			.filter(Boolean)
			.map((src) => new URL(src, this.url).href);
		if (!pages.length) {
			throw new Error(
				`WiComix: chapter ${chapter.id} has no pages, expected at least one '${PAGE_IMAGE_SELECTOR}' image`,
			);
		}
		return pages;
	}

	async _readSitemapLastmods() {
		const index = parseXmlDocument(await this._fetchText('/sitemap.xml'));
		const lastmods = new Map();
		for (const sitemapPath of readMangaSitemapPaths(index)) {
			const urlset = parseXmlDocument(await this._fetchText(sitemapPath));
			for (const [slug, lastmod] of readSitemapUrls(urlset)) {
				if (!lastmods.has(slug)) lastmods.set(slug, lastmod);
			}
		}
		return lastmods;
	}

	async _refreshEntry(run, slug, lastmod) {
		run.fetched++;
		try {
			const comic = this._readComic(
				await this._fetchText(`/manga/${slug}`),
				slug,
			).comic;
			run.entries.set(slug, toIndexEntry(comic, lastmod));
		} catch (error) {
			run.failures++;
			this._warnSkipped(slug, error);
		}
		if (run.fetched % INDEX_CHECKPOINT_EVERY === 0) {
			await this.indexStore.save(Object.fromEntries(run.entries));
		}
	}

	_readComic(html, slug) {
		const page = readComicPage(html, slug);
		if (!page.comic) {
			throw new Error(
				`WiComix: /manga/${slug} has no comic row for slug "${slug}" in its flight payload`,
			);
		}
		return page;
	}

	_assertFailureRatio(failures, total) {
		const limit = Math.floor(total * MAX_FAILURE_RATIO);
		if (failures <= limit) return;
		throw new Error(
			`WiComix: ${failures} of ${total} work pages failed, limit is ${limit}`,
		);
	}

	_warnSkipped(slug, error) {
		this.logger.warn(
			JSON.stringify({
				connector: this.id,
				event: 'wicomix_manga_skipped',
				slug,
				error: error.message,
			}),
		);
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

	async _fetchText(path, retriesLeft = REQUEST_RETRIES) {
		await this._waitForRequestSlot();
		const url = `${this.url}${path}`;
		const response = await fetch(this._buildRequest(url));
		if (response.status === 200) return response.text();
		if (response.status >= 500 && retriesLeft > 0) {
			await this.wait(SERVER_ERROR_DELAY_MS);
			return this._fetchText(path, retriesLeft - 1);
		}
		throw new Error(
			`WiComix: GET ${url} answered ${response.status}, expected 200`,
		);
	}

	_buildRequest(url) {
		return new Request(url, {
			headers: { 'user-agent': BROWSER_USER_AGENT },
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
	}
}

function readMangaSitemapPaths(index) {
	return index
		.select('sitemap > loc')
		.map((loc) => new URL(loc.text()).pathname)
		.filter((pathname) => MANGA_SITEMAP_PATH.test(pathname));
}

function readSitemapUrls(urlset) {
	return urlset
		.select('url')
		.map(readSitemapUrl)
		.filter(([slug]) => slug);
}

function readSitemapUrl(url) {
	const loc = url.select('loc')[0]?.text() ?? '';
	const slug = URL.parse(loc)?.pathname.match(MANGA_PATH)?.[1];
	return [slug, url.select('lastmod')[0]?.text() ?? ''];
}

// Slugs no longer in any sitemap leave the index (plan AC 9).
function keepListedEntries(previous, lastmods) {
	return new Map(
		Object.entries(previous).filter(([slug]) => lastmods.has(slug)),
	);
}

function toIndexEntry(comic, lastmod) {
	return {
		lastmod,
		title: comic.title,
		altTitles: comic.altTitles,
		coverUrl: comic.coverUrl,
		novel: comic.type === 'novel',
	};
}

function toCatalogEntry([slug, entry]) {
	return this._toCatalogEntry(
		slug,
		entry.title,
		entry.coverUrl,
		entry.altTitles,
	);
}

function isReadableChapter(chapter) {
	return (
		chapter.locked !== true &&
		chapter.type === 'images' &&
		chapter.status === 'approved'
	);
}

import defaultLogger from '../../infra/logger.js';
import Connector from '../Connector.js';
import { findBundlePath, findCipherSecret } from './bundleSecret.js';
import {
	assertPlainImageChapter,
	isDownloadableManga,
	isFreeChapter,
	toChapterEntry,
} from './contentRules.js';
import {
	decryptPayload,
	deriveCipherKeys,
	isEncryptedPayload,
} from './responseCipher.js';

// Literal from /assets/index-C5k-fnOg.js (2026-10-16); used only when the
// live bundle can no longer be parsed.
const FALLBACK_SECRET = 'OrionNexus2025CryptoKey!Secure';
// The /api backend sits behind Cloudflare; pacing keeps Turnstile from
// being switched on for every chapter (plan D7).
const API_DELAY_MS = 1000;
const CATALOG_PAGE_SIZE = 1000;
const API_RETRIES = 2;
// Bounds a stalled Cloudflare connection so it cannot pin a worker slot.
const REQUEST_TIMEOUT_MS = 60_000;
const BROWSER_USER_AGENT =
	'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';

export default class NexusToons extends Connector {
	constructor({ apiDelayMs = API_DELAY_MS, logger = defaultLogger } = {}) {
		super({
			id: 'nexustoons',
			label: 'Nexus Toons',
			tags: ['manhwa', 'portuguese'],
			url: 'https://nexustoons.com',
		});
		this.apiDelayMs = apiDelayMs;
		this.logger = logger;
		this.cipherKeys = null;
		this.cipherKeysLoading = null;
		this.lastApiSlot = Promise.resolve();
	}

	// The worker calls this before every job and runs jobs concurrently on
	// one instance, so concurrent callers share a single in-flight load.
	initialize() {
		this.cipherKeysLoading ??= this._loadCipherKeys();
		return this.cipherKeysLoading;
	}

	async _loadCipherKeys() {
		const secret = await this._extractSecretFromBundle().catch((error) =>
			this._fallBackToKnownSecret(error),
		);
		this.cipherKeys = deriveCipherKeys(secret);
	}

	async _getMangas() {
		const firstPage = await this._fetchCatalogPage(1);
		const pages = [firstPage];
		for (let page = 2; page <= firstPage.pages; page++) {
			pages.push(await this._fetchCatalogPage(page));
		}
		return pages
			.flatMap((catalogPage) => catalogPage.data)
			.filter(isDownloadableManga)
			.map((manga) =>
				this._toCatalogEntry(manga.slug, manga.title, manga.coverImage),
			);
	}

	async _getChapters(manga) {
		const detail = await this._fetchApi(
			`/manga/${encodeURIComponent(manga.id)}`,
		);
		return (detail.chapters ?? []).filter(isFreeChapter).map(toChapterEntry);
	}

	async _getPages(chapter) {
		const reader = await this._fetchApi(
			`/chapter/${encodeURIComponent(chapter.id)}`,
		);
		assertPlainImageChapter(chapter.id, reader);
		return this._toPageUrls(reader);
	}

	// Mirrors the site reader: a page without imageUrl is served by
	// /api/p/{pageToken}/{index}, index being its position in the response.
	_toPageUrls(reader) {
		return reader.pages
			.map((page, index) => ({
				pageNumber: page.pageNumber ?? index,
				url: page.imageUrl || `${this.url}/api/p/${reader.pageToken}/${index}`,
			}))
			.sort((a, b) => a.pageNumber - b.pageNumber)
			.map((page) => page.url);
	}

	_fetchCatalogPage(page) {
		return this._fetchApi(`/mangas?page=${page}&limit=${CATALOG_PAGE_SIZE}`);
	}

	// Chains every /api call on the shared instance so concurrent jobs keep
	// apiDelayMs between requests instead of each waiting on its own.
	_waitForApiSlot() {
		const slot = this.lastApiSlot.then(() => this.wait(this.apiDelayMs));
		this.lastApiSlot = slot;
		return slot;
	}

	async _fetchApi(path) {
		await this._waitForApiSlot();
		const payload = await this.fetchJSON(
			this._buildRequest(`${this.url}/api${path}`),
			API_RETRIES,
		);
		if (!isEncryptedPayload(payload)) return payload;
		try {
			return decryptPayload(this.cipherKeys, payload);
		} catch (error) {
			throw new Error(
				`NexusToons: failed to decrypt /api${path} (k=${payload.k}, v=${payload.v}), expected JSON: ${error.message}`,
			);
		}
	}

	// /api/chapter/{id} answers 403 without a same-site Referer; any page of
	// the site works, so every request carries the root.
	_buildRequest(url) {
		return new Request(url, {
			headers: { 'user-agent': BROWSER_USER_AGENT, referer: `${this.url}/` },
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
	}

	async _fetchText(url) {
		const response = await fetch(this._buildRequest(url));
		if (response.status !== 200) {
			throw new Error(
				`NexusToons: GET ${url} answered ${response.status}, expected 200`,
			);
		}
		return response.text();
	}

	// The fallback may be stale (the site rotated the secret), so it is not
	// cached: the next job tries the live bundle again.
	_fallBackToKnownSecret(error) {
		this.logger.warn(
			JSON.stringify({
				connector: this.id,
				event: 'cipher_secret_fallback',
				reason: error.message,
			}),
		);
		this.cipherKeysLoading = null;
		return FALLBACK_SECRET;
	}

	async _extractSecretFromBundle() {
		const bundlePath = findBundlePath(await this._fetchText(`${this.url}/`));
		if (!bundlePath) {
			throw new Error(
				`no /assets/index-*.js bundle referenced by ${this.url}/`,
			);
		}
		const secret = findCipherSecret(
			await this._fetchText(`${this.url}${bundlePath}`),
		);
		if (!secret) {
			throw new Error(`initFromSecret("...") call not found in ${bundlePath}`);
		}
		return secret;
	}
}

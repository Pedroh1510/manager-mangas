import defaultLogger from '../../infra/logger.js';
import Connector from '../Connector.js';
import { findAnonKey, findBundlePath } from './anonKey.js';
import { assertReadableChapter, toChapterEntry } from './contentRules.js';

const SUPABASE_URL = 'https://supabase.nexusmangas.com';
// Public anon JWT from /assets/entries/pages.D2BFSKBZ.js (2026-10-17);
// used only when the live bundle can no longer be parsed. Not a secret: the
// site ships it to every visitor (role "anon"), hence the gitleaks allow.
const FALLBACK_ANON_KEY =
	'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc4NzgwMjAwMCwiZXhwIjo0OTQzNDc1NjAwLCJyb2xlIjoiYW5vbiJ9.Cnl8Jw2DeKe84OAkmJYfO33xlcZsw0TC2Nw_il0tpRs'; // gitleaks:allow
// The site reader sends this on every read-chapter call.
const READER_CLIENT = 'reader-v4';
// The backend rate limits (429); a slow steady pace keeps it from tripping
// (plan AC 12).
const API_DELAY_MS = 2000;
const CATALOG_PAGE_SIZE = 1000;
const API_RETRIES = 2;
const SERVER_ERROR_DELAY_MS = 5000;
const DEFAULT_RETRY_AFTER_MS = 2000;
const REQUEST_TIMEOUT_MS = 60_000;
const BROWSER_USER_AGENT =
	'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
const CATALOG_SELECT = 'id,slug,title,cover_url,alternative_title';
const CHAPTER_SELECT = 'id,work_id,number,chapter_label,title,published_at';

export default class NexusMangas extends Connector {
	constructor({ apiDelayMs = API_DELAY_MS, logger = defaultLogger } = {}) {
		super({
			id: 'nexusmangas',
			label: 'Nexus Mangas',
			tags: ['manhwa', 'portuguese'],
			url: 'https://www.nexusmangas.com',
		});
		this.apiDelayMs = apiDelayMs;
		this.logger = logger;
		this.anonKey = null;
		this.anonKeyLoading = null;
		this.lastApiSlot = Promise.resolve();
	}

	// The worker calls this before every job and runs jobs concurrently on
	// one instance, so concurrent callers share a single in-flight load.
	initialize() {
		this.anonKeyLoading ??= this._loadAnonKey();
		return this.anonKeyLoading;
	}

	async _loadAnonKey() {
		this.anonKey = await this._extractAnonKeyFromBundle().catch((error) =>
			this._fallBackToKnownKey(error),
		);
	}

	async _getMangas() {
		const works = [];
		for (let offset = 0; ; offset += CATALOG_PAGE_SIZE) {
			const page = await this._fetchCatalogPage(offset);
			works.push(...page);
			if (page.length < CATALOG_PAGE_SIZE) break;
		}
		return works.map((work) =>
			this._toCatalogEntry(work.id, work.title, work.cover_url, [
				work.alternative_title,
			]),
		);
	}

	async _getChapters(manga) {
		const query = new URLSearchParams({
			select: CHAPTER_SELECT,
			work_id: `eq.${manga.id}`,
			order: 'number.asc',
		});
		const chapters = await this._fetchApi(`/rest/v1/chapters?${query}`);
		return chapters.map(toChapterEntry);
	}

	async _getPages(chapter) {
		const reader = await this._fetchApi('/functions/v1/read-chapter', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-nexus-client': READER_CLIENT,
			},
			body: JSON.stringify({ chapterId: chapter.id }),
		});
		assertReadableChapter(chapter.id, reader);
		return reader.chapter.pages;
	}

	_fetchCatalogPage(offset) {
		const query = new URLSearchParams({
			select: CATALOG_SELECT,
			is_licensed: 'eq.false',
			type: 'neq.NOVEL',
			order: 'id.asc',
			limit: String(CATALOG_PAGE_SIZE),
			offset: String(offset),
		});
		return this._fetchApi(`/rest/v1/works?${query}`);
	}

	// Chains every Supabase call on the shared instance so concurrent jobs
	// keep apiDelayMs between requests instead of each waiting on its own.
	_waitForApiSlot() {
		const slot = this.lastApiSlot.then(() => this.wait(this.apiDelayMs));
		this.lastApiSlot = slot;
		return slot;
	}

	// fetchJSON only retries 5xx; 429 needs the server's own delay, so the
	// connector owns the retry loop for both.
	async _fetchApi(path, init = {}, retriesLeft = API_RETRIES) {
		await this._waitForApiSlot();
		const response = await fetch(this._buildApiRequest(path, init));
		if (response.status === 200) return response.json();
		const retryable = response.status === 429 || response.status >= 500;
		if (retryable && retriesLeft > 0) {
			await this.wait(await this._retryDelayMs(response));
			return this._fetchApi(path, init, retriesLeft - 1);
		}
		throw new Error(
			`NexusMangas: ${init.method ?? 'GET'} ${path} answered ${response.status}, expected 200`,
		);
	}

	async _retryDelayMs(response) {
		if (response.status !== 429) return SERVER_ERROR_DELAY_MS;
		const body = await response.json().catch(() => null);
		const seconds =
			Number(body?.retryAfterSeconds) ||
			Number(response.headers?.get('retry-after'));
		return seconds > 0 ? seconds * 1000 : DEFAULT_RETRY_AFTER_MS;
	}

	// A Request body is single use, so every attempt builds its own.
	_buildApiRequest(path, { method = 'GET', headers = {}, body } = {}) {
		return new Request(`${SUPABASE_URL}${path}`, {
			method,
			body,
			headers: {
				'user-agent': BROWSER_USER_AGENT,
				apikey: this.anonKey,
				authorization: `Bearer ${this.anonKey}`,
				...headers,
			},
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
	}

	async _fetchText(url) {
		const response = await fetch(
			new Request(url, {
				headers: { 'user-agent': BROWSER_USER_AGENT },
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			}),
		);
		if (response.status !== 200) {
			throw new Error(
				`NexusMangas: GET ${url} answered ${response.status}, expected 200`,
			);
		}
		return response.text();
	}

	// The fallback may be stale (the site rotated the key), so it is not
	// cached: the next job tries the live bundle again.
	_fallBackToKnownKey(error) {
		this.logger.warn(
			JSON.stringify({
				connector: this.id,
				event: 'anon_key_fallback',
				reason: error.message,
			}),
		);
		this.anonKeyLoading = null;
		return FALLBACK_ANON_KEY;
	}

	async _extractAnonKeyFromBundle() {
		const bundlePath = findBundlePath(await this._fetchText(`${this.url}/`));
		if (!bundlePath) {
			throw new Error(
				`no /assets/entries/pages.*.js bundle referenced by ${this.url}/`,
			);
		}
		const key = findAnonKey(await this._fetchText(`${this.url}${bundlePath}`));
		if (!key) {
			throw new Error(`Supabase anon key not found in ${bundlePath}`);
		}
		return key;
	}
}

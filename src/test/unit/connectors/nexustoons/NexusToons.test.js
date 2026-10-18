import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import NexusToons from '../../../../connectors/nexustoons/NexusToons.js';

const FIXTURES = new URL('../../../fixtures/nexustoons/', import.meta.url);
const readFixture = (name) =>
	JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'));

const SHELL_HTML =
	'<div id="root"></div><script type="module" src="/assets/index-C5k-fnOg.js"></script>';
const BUNDLE_SOURCE =
	'const e="OrionNexus2025CryptoKey!Secure";return await Sr.initFromSecret(e)';

/** Serves canned bodies keyed by path+query; anything else answers 404. */
class FakeNexusToonsSite {
	constructor(routes) {
		this.routes = routes;
		this.requests = [];
	}

	fetch = async (request) => {
		this.requests.push(request);
		const { pathname, search } = new URL(request.url);
		const body = this.routes[pathname + search];
		const status = body === undefined ? 404 : 200;
		return {
			status,
			statusText: status === 200 ? 'OK' : 'Not Found',
			json: async () => body,
			text: async () => body,
		};
	};
}

class FakeLogger {
	warnings = [];
	warn(message) {
		this.warnings.push(message);
	}
}

const siteRoutes = (extra) => ({
	'/': SHELL_HTML,
	'/assets/index-C5k-fnOg.js': BUNDLE_SOURCE,
	...extra,
});

async function buildConnector(routes, logger = new FakeLogger()) {
	const site = new FakeNexusToonsSite(routes);
	vi.stubGlobal('fetch', site.fetch);
	const connector = new NexusToons({ apiDelayMs: 0, logger });
	await connector.initialize();
	return { connector, site, logger };
}

const catalogManga = (overrides) => ({
	slug: 'obra',
	title: 'Obra',
	type: 'manhwa',
	isVipOnly: false,
	isNsfw: false,
	officialLink: '',
	...overrides,
});

const freeChapter = (overrides) => ({
	id: 1,
	number: '1',
	title: '',
	accessLevel: 'public',
	coinCost: 0,
	releaseStatus: 'published',
	...overrides,
});

describe('NexusToons', () => {
	afterEach(() => vi.unstubAllGlobals());

	test('sets id, label, tags and base url', () => {
		const connector = new NexusToons();
		expect(connector.id).toBe('nexustoons');
		expect(connector.label).toBe('Nexus Toons');
		expect(connector.tags).toEqual(['manhwa', 'portuguese']);
		expect(connector.url).toBe('https://nexustoons.com');
	});

	describe('initialize', () => {
		test('extracts the secret from the bundle and decrypts real responses', async () => {
			const { connector, logger } = await buildConnector(
				siteRoutes({ '/api/chapter/72403': readFixture('chapter.enc.json') }),
			);
			const pages = await connector._getPages({ id: '72403' });
			expect(pages).toHaveLength(8);
			expect(logger.warnings).toEqual([]);
		});

		test('falls back to the known secret and logs when the bundle has no initFromSecret call', async () => {
			const { connector, logger } = await buildConnector({
				'/': SHELL_HTML,
				'/assets/index-C5k-fnOg.js': 'console.log(1)',
				'/api/chapter/72403': readFixture('chapter.enc.json'),
			});
			expect(await connector._getPages({ id: '72403' })).toHaveLength(8);
			expect(logger.warnings).toHaveLength(1);
			expect(JSON.stringify(logger.warnings[0])).toContain('index-C5k-fnOg.js');
		});

		test('fetches the bundle only once across jobs', async () => {
			const { connector, site } = await buildConnector(siteRoutes());
			await connector.initialize();
			const bundleHits = site.requests.filter((r) => r.url.endsWith('.js'));
			expect(bundleHits).toHaveLength(1);
		});

		test('two jobs initializing at once share a single bundle fetch', async () => {
			const site = new FakeNexusToonsSite(siteRoutes());
			vi.stubGlobal('fetch', site.fetch);
			const connector = new NexusToons({
				apiDelayMs: 0,
				logger: new FakeLogger(),
			});
			await Promise.all([connector.initialize(), connector.initialize()]);
			const bundleHits = site.requests.filter((r) => r.url.endsWith('.js'));
			expect(bundleHits).toHaveLength(1);
		});

		test('retries the bundle on the next job after falling back', async () => {
			const { connector, site } = await buildConnector({ '/': SHELL_HTML });
			await connector.initialize();
			const homeHits = site.requests.filter((r) => r.url.endsWith('.com/'));
			expect(homeHits).toHaveLength(2);
		});
	});

	describe('API pacing', () => {
		afterEach(() => vi.useRealTimers());

		test('spaces requests across concurrent jobs sharing the instance', async () => {
			const site = new FakeNexusToonsSite(
				siteRoutes({
					'/api/manga/a': { chapters: [] },
					'/api/manga/b': { chapters: [] },
				}),
			);
			vi.stubGlobal('fetch', site.fetch);
			const connector = new NexusToons({
				apiDelayMs: 1000,
				logger: new FakeLogger(),
			});
			await connector.initialize();
			vi.useFakeTimers();
			const apiHits = () =>
				site.requests.filter((r) => r.url.includes('/api/'));

			const jobs = Promise.all([
				connector._getChapters({ id: 'a' }),
				connector._getChapters({ id: 'b' }),
			]);
			await vi.advanceTimersByTimeAsync(1000);
			expect(apiHits()).toHaveLength(1);
			await vi.advanceTimersByTimeAsync(1000);
			expect(apiHits()).toHaveLength(2);
			await jobs;
		});
	});

	describe('_getMangas', () => {
		test('walks every catalog page with limit=1000 and returns slug ids', async () => {
			const { connector } = await buildConnector(
				siteRoutes({
					'/api/mangas?page=1&limit=1000&includeNsfw=true': {
						data: [catalogManga({ slug: 'a', title: 'A' })],
						pages: 2,
					},
					'/api/mangas?page=2&limit=1000&includeNsfw=true': {
						data: [catalogManga({ slug: 'b', title: 'B' })],
						pages: 2,
					},
				}),
			);
			expect(await connector._getMangas()).toEqual([
				{ id: 'a', title: 'A' },
				{ id: 'b', title: 'B' },
			]);
		});

		const catalogOf = (data) =>
			buildConnector(
				siteRoutes({
					'/api/mangas?page=1&limit=1000&includeNsfw=true': { pages: 1, data },
				}),
			).then(({ connector }) => connector._getMangas());

		// Regression: the API hides isNsfw works unless includeNsfw=true is sent.
		test('keeps +18 works in the catalog', async () => {
			const mangas = await catalogOf([
				catalogManga({
					slug: 'moby-dick',
					title: 'Moby Dick',
					type: 'pornhwa',
					isNsfw: true,
				}),
			]);
			expect(mangas.map((manga) => manga.id)).toEqual(['moby-dick']);
		});

		test('maps coverImage to coverUrl', async () => {
			const mangas = await catalogOf([
				catalogManga({
					slug: 'pico-marcial',
					title: 'Pico Marcial',
					coverImage: 'https://img.nx-toons.xyz/covers/a.jpg',
				}),
			]);

			expect(mangas).toEqual([
				{
					id: 'pico-marcial',
					title: 'Pico Marcial',
					coverUrl: 'https://img.nx-toons.xyz/covers/a.jpg',
				},
			]);
		});

		test('omits coverUrl when coverImage is missing, null or empty', async () => {
			const mangas = await catalogOf([
				catalogManga({ slug: 'sem-campo' }),
				catalogManga({ slug: 'nulo', coverImage: null }),
				catalogManga({ slug: 'vazio', coverImage: '' }),
			]);

			expect(mangas).toHaveLength(3);
			for (const manga of mangas) {
				expect('coverUrl' in manga).toBe(false);
			}
		});

		test('drops VIP, licensed and novel titles but keeps NSFW', async () => {
			const { connector } = await buildConnector(
				siteRoutes({
					'/api/mangas?page=1&limit=1000&includeNsfw=true': {
						pages: 1,
						data: [
							catalogManga({ slug: 'vip', isVipOnly: true }),
							catalogManga({ slug: 'licensed', officialLink: 'https://x' }),
							catalogManga({ slug: 'novel', type: 'novel' }),
							catalogManga({ slug: 'nsfw', isNsfw: true }),
						],
					},
				}),
			);
			const ids = (await connector._getMangas()).map((m) => m.id);
			expect(ids).toEqual(['nsfw']);
		});
	});

	describe('_getChapters', () => {
		test('lists the free chapters of a captured manga with Cap. titles in pt', async () => {
			const { connector } = await buildConnector(
				siteRoutes({
					'/api/manga/biblioteca-do-caminho-celestial': readFixture(
						'manga-public.enc.json',
					),
				}),
			);
			const chapters = await connector._getChapters({
				id: 'biblioteca-do-caminho-celestial',
			});
			expect(chapters).toHaveLength(323);
			expect(chapters[0]).toEqual({
				id: '72403',
				title: 'Cap. 322',
				language: 'pt',
			});
		});

		test('drops paid, locked and unpublished chapters', async () => {
			const { connector } = await buildConnector(
				siteRoutes({
					'/api/manga/obra': {
						chapters: [
							freeChapter({ id: 1 }),
							freeChapter({ id: 2, coinCost: 5 }),
							freeChapter({ id: 3, accessLevel: 'vip' }),
							freeChapter({ id: 4, releaseStatus: 'scheduled' }),
						],
					},
				}),
			);
			const ids = (await connector._getChapters({ id: 'obra' })).map(
				(c) => c.id,
			);
			expect(ids).toEqual(['1']);
		});

		test('appends the chapter title when present', async () => {
			const { connector } = await buildConnector(
				siteRoutes({
					'/api/manga/obra': {
						chapters: [freeChapter({ id: 7, number: '7.5', title: 'Extra' })],
					},
				}),
			);
			const [chapter] = await connector._getChapters({ id: 'obra' });
			expect(chapter.title).toBe('Cap. 7.5 - Extra');
		});

		test('returns no chapters for a licensed title', async () => {
			const { connector } = await buildConnector(
				siteRoutes({
					'/api/manga/solo-leveling': readFixture('manga-licensed.enc.json'),
				}),
			);
			expect(await connector._getChapters({ id: 'solo-leveling' })).toEqual([]);
		});
	});

	describe('_getPages', () => {
		const chapterRoute = (body) => siteRoutes({ '/api/chapter/9': body });

		test('returns image urls ordered by pageNumber and sends a site Referer', async () => {
			const { connector, site } = await buildConnector(
				chapterRoute({
					contentType: 'images',
					pages: [
						{ pageNumber: 2, imageUrl: 'https://img/2.webp' },
						{ pageNumber: 1, imageUrl: 'https://img/1.webp' },
					],
				}),
			);
			expect(await connector._getPages({ id: '9' })).toEqual([
				'https://img/1.webp',
				'https://img/2.webp',
			]);
			const apiRequest = site.requests.find((r) =>
				r.url.includes('/api/chapter/'),
			);
			expect(apiRequest.headers.get('referer')).toBe('https://nexustoons.com/');
		});

		test('builds /api/p/{pageToken}/{index} urls when imageUrl is missing', async () => {
			const { connector } = await buildConnector(
				chapterRoute({
					contentType: 'images',
					pageToken: 'tok',
					pages: [{ pageNumber: 1 }, { pageNumber: 2 }],
				}),
			);
			expect(await connector._getPages({ id: '9' })).toEqual([
				'https://nexustoons.com/api/p/tok/0',
				'https://nexustoons.com/api/p/tok/1',
			]);
		});

		test('rejects chapters that require a Turnstile reading session', async () => {
			const { connector } = await buildConnector(
				chapterRoute({
					contentType: 'images',
					requiresSession: true,
					pages: [],
				}),
			);
			await expect(connector._getPages({ id: '9' })).rejects.toThrow(
				'chapter 9 requires a Turnstile reading session, not supported',
			);
		});

		test('rejects canvas-encrypted pages carrying a dk key', async () => {
			const { connector } = await buildConnector(
				chapterRoute({
					contentType: 'images',
					pages: [{ pageNumber: 1, imageUrl: 'https://img/1', dk: 'abc' }],
				}),
			);
			await expect(connector._getPages({ id: '9' })).rejects.toThrow(
				'chapter 9 has encrypted page images (dk), not supported',
			);
		});

		test('rejects text chapters naming the content type', async () => {
			const { connector } = await buildConnector(
				chapterRoute({ contentType: 'text', textContent: '...' }),
			);
			await expect(connector._getPages({ id: '9' })).rejects.toThrow(
				'contentType "text", expected "images"',
			);
		});
	});
});

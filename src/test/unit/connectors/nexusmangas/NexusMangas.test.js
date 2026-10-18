import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import NexusMangas from '../../../../connectors/nexusmangas/NexusMangas.js';

const FIXTURES = new URL('../../../fixtures/nexusmangas/', import.meta.url);
const readFixture = (name) =>
	JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'));

const SITE = 'https://www.nexusmangas.com';
const SUPABASE = 'https://supabase.nexusmangas.com';
const BUNDLE_PATH = '/assets/entries/pages.D2BFSKBZ.js';
const BUNDLE_KEY = 'eyJ0eXAiOiJKV1QifQ.eyJyb2xlIjoiYW5vbiJ9.bundle-sig';
const SHELL_HTML = `<link rel="modulepreload" href="${BUNDLE_PATH}" as="script" type="text/javascript">`;
const BUNDLE_SOURCE = `const $s="${SUPABASE}",La="${BUNDLE_KEY}";`;

const json = (body, status = 200, headers = {}) => ({ status, body, headers });

/**
 * Answers by `METHOD url-without-origin`; a handler may be a canned answer,
 * a list consumed one per request, or a function of the Request.
 */
class FakeNexusMangasSite {
	constructor(routes) {
		this.routes = routes;
		this.requests = [];
	}

	fetch = async (request) => {
		this.requests.push({ request, at: Date.now() });
		const url = new URL(request.url);
		const handler =
			this.routes[`${request.method} ${url.origin}${url.pathname}`];
		const answer = await this._answer(handler, request);
		const { status, body, headers = {} } = answer ?? { status: 404, body: '' };
		return {
			status,
			statusText: String(status),
			headers: new Headers(headers),
			json: async () => body,
			text: async () => body,
		};
	};

	_answer(handler, request) {
		if (Array.isArray(handler)) return handler.shift();
		if (typeof handler === 'function') return handler(request);
		return handler;
	}

	requestsTo(pathname) {
		return this.requests
			.map(({ request }) => request)
			.filter((request) => new URL(request.url).pathname === pathname);
	}
}

class FakeLogger {
	warnings = [];
	warn(message) {
		this.warnings.push(message);
	}
}

const siteRoutes = (extra) => ({
	[`GET ${SITE}/`]: json(SHELL_HTML),
	[`GET ${SITE}${BUNDLE_PATH}`]: json(BUNDLE_SOURCE),
	...extra,
});

function buildConnector(
	routes,
	{ apiDelayMs = 0, logger = new FakeLogger() } = {},
) {
	const site = new FakeNexusMangasSite(routes);
	vi.stubGlobal('fetch', site.fetch);
	const connector = new NexusMangas({ apiDelayMs, logger });
	return { connector, site, logger };
}

async function initializedConnector(routes, options) {
	const built = buildConnector(routes, options);
	await built.connector.initialize();
	return built;
}

const work = (index) => ({
	id: `work-${index}`,
	slug: `obra-${index}`,
	title: `Obra ${index}`,
	type: 'MANHWA',
	cover_url: `https://assets.nexusmangas.com/covers/${index}.webp`,
	is_licensed: false,
});

const readChapterFrom = (fixture, chapterOverrides) => {
	const response = readFixture(fixture);
	return { ...response, chapter: { ...response.chapter, ...chapterOverrides } };
};

describe('NexusMangas', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	test('sets id, label and base url', () => {
		const connector = new NexusMangas();
		expect(connector.id).toBe('nexusmangas');
		expect(connector.label).toBe('Nexus Mangas');
		expect(connector.url).toBe(SITE);
	});

	describe('catalog', () => {
		test('catalog paginates by offset until a short page', async () => {
			const fullPage = Array.from({ length: 1000 }, (_, i) => work(i));
			const shortPage = readFixture('works-page.json');
			const { connector, site } = await initializedConnector(
				siteRoutes({
					[`GET ${SUPABASE}/rest/v1/works`]: (request) => {
						const offset = new URL(request.url).searchParams.get('offset');
						return json(offset === '0' ? fullPage : shortPage);
					},
				}),
			);

			const mangas = await connector._getMangas();

			const params = site
				.requestsTo('/rest/v1/works')
				.map((request) => new URL(request.url).searchParams);
			expect(params.map((p) => p.get('offset'))).toEqual(['0', '1000']);
			expect(params.every((p) => p.get('limit') === '1000')).toBe(true);
			expect(mangas).toHaveLength(1000 + shortPage.length);
			expect(mangas.at(-1).id).toBe(shortPage.at(-1).id);
		});

		test('catalog query excludes licensed works and novels', async () => {
			const { connector, site } = await initializedConnector(
				siteRoutes({ [`GET ${SUPABASE}/rest/v1/works`]: json([work(1)]) }),
			);

			await connector._getMangas();

			const [request] = site.requestsTo('/rest/v1/works');
			const params = new URL(request.url).searchParams;
			expect(params.get('is_licensed')).toBe('eq.false');
			expect(params.get('type')).toBe('neq.NOVEL');
		});

		test('catalog entry uses the work uuid and cover_url', async () => {
			const [recorded] = readFixture('works-page.json');
			const { connector } = await initializedConnector(
				siteRoutes({
					[`GET ${SUPABASE}/rest/v1/works`]: json([
						recorded,
						{ ...work(2), cover_url: '' },
					]),
				}),
			);

			const [withCover, withoutCover] = await connector._getMangas();

			expect(withCover).toEqual({
				id: recorded.id,
				title: recorded.title,
				coverUrl: recorded.cover_url,
			});
			expect(withoutCover).toEqual({ id: 'work-2', title: 'Obra 2' });
		});
	});

	describe('chapters', () => {
		test('chapters are requested by work id in number order', async () => {
			const chapters = readFixture('chapters.json');
			const { connector, site } = await initializedConnector(
				siteRoutes({ [`GET ${SUPABASE}/rest/v1/chapters`]: json(chapters) }),
			);

			await connector._getChapters({ id: chapters[0].work_id });

			const [request] = site.requestsTo('/rest/v1/chapters');
			const params = new URL(request.url).searchParams;
			expect(params.get('select')).toBe(
				'id,work_id,number,chapter_label,title,published_at',
			);
			expect(params.get('work_id')).toBe(`eq.${chapters[0].work_id}`);
			expect(params.get('order')).toBe('number.asc');
		});

		test('chapter title is Cap. number regardless of title', async () => {
			const [recorded] = readFixture('chapters.json');
			const { connector } = await initializedConnector(
				siteRoutes({
					[`GET ${SUPABASE}/rest/v1/chapters`]: json([
						{
							...recorded,
							number: 10.5,
							title: 'O retorno',
							chapter_label: 'Extra',
						},
					]),
				}),
			);

			const [chapter] = await connector._getChapters({ id: recorded.work_id });

			expect(chapter).toEqual({
				id: recorded.id,
				title: 'Cap. 10.5',
				language: 'pt',
			});
		});
	});

	describe('pages', () => {
		const READ_CHAPTER = `POST ${SUPABASE}/functions/v1/read-chapter`;

		test('pages come from read-chapter in response order', async () => {
			const allowed = readFixture('read-chapter-allowed.json');
			const { connector, site } = await initializedConnector(
				siteRoutes({ [READ_CHAPTER]: json(allowed) }),
			);

			const pages = await connector._getPages({ id: allowed.chapter.id });

			const [request] = site.requestsTo('/functions/v1/read-chapter');
			expect(request.headers.get('x-nexus-client')).toBe('reader-v4');
			expect(request.headers.get('content-type')).toBe('application/json');
			expect(JSON.parse(await request.text())).toEqual({
				chapterId: allowed.chapter.id,
			});
			expect(pages).toEqual(allowed.chapter.pages);
		});

		test('blocked chapter rejects with its access reason', async () => {
			const licensed = readFixture('read-chapter-licensed.json');
			const paywalled = {
				...licensed,
				access: { allowed: false, reason: 'PAYWALL' },
			};
			const { connector } = await initializedConnector(
				siteRoutes({ [READ_CHAPTER]: [json(licensed), json(paywalled)] }),
			);
			const chapter = { id: licensed.chapter.id };

			await expect(connector._getPages(chapter)).rejects.toThrow(
				new RegExp(`${chapter.id}.*LICENSED`),
			);
			await expect(connector._getPages(chapter)).rejects.toThrow(
				new RegExp(`${chapter.id}.*PAYWALL`),
			);
		});

		test('novel or empty chapter rejects', async () => {
			const novel = readChapterFrom('read-chapter-allowed.json', {
				is_novel: true,
			});
			const empty = readChapterFrom('read-chapter-allowed.json', { pages: [] });
			const { connector } = await initializedConnector(
				siteRoutes({ [READ_CHAPTER]: [json(novel), json(empty)] }),
			);
			const chapter = { id: novel.chapter.id };

			await expect(connector._getPages(chapter)).rejects.toThrow(chapter.id);
			await expect(connector._getPages(chapter)).rejects.toThrow(chapter.id);
		});
	});

	describe('anon key', () => {
		const chaptersRoute = {
			[`GET ${SUPABASE}/rest/v1/chapters`]: json([]),
		};

		test('requests carry the anon key extracted from the bundle', async () => {
			const { connector, site } = await initializedConnector(
				siteRoutes(chaptersRoute),
			);

			await connector._getChapters({ id: 'work-1' });

			const [request] = site.requestsTo('/rest/v1/chapters');
			expect(request.headers.get('apikey')).toBe(BUNDLE_KEY);
			expect(request.headers.get('authorization')).toBe(`Bearer ${BUNDLE_KEY}`);
		});

		test('falls back to the known key and retries extraction next time', async () => {
			const routes = siteRoutes(chaptersRoute);
			delete routes[`GET ${SITE}${BUNDLE_PATH}`];
			const { connector, site, logger } = await initializedConnector(routes);

			await connector._getChapters({ id: 'work-1' });
			await connector.initialize();

			const [request] = site.requestsTo('/rest/v1/chapters');
			const fallbackKey = request.headers.get('apikey');
			expect(fallbackKey).toMatch(/^eyJ/);
			expect(fallbackKey).not.toBe(BUNDLE_KEY);
			expect(request.headers.get('authorization')).toBe(
				`Bearer ${fallbackKey}`,
			);
			expect(logger.warnings.map((w) => JSON.parse(w).event)).toContain(
				'anon_key_fallback',
			);
			expect(site.requestsTo('/')).toHaveLength(2);
		});

		test('concurrent initialize loads the key once', async () => {
			const { connector, site } = buildConnector(siteRoutes());

			await Promise.all([connector.initialize(), connector.initialize()]);

			expect(site.requestsTo('/')).toHaveLength(1);
		});
	});

	describe('pacing and limits', () => {
		const CHAPTERS = `GET ${SUPABASE}/rest/v1/chapters`;

		test('requests are spaced 2000 ms apart across concurrent calls', async () => {
			vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
			const { connector, site } = buildConnector(
				siteRoutes({ [CHAPTERS]: json([]) }),
				{ apiDelayMs: 2000 },
			);
			await connector.initialize();

			const both = Promise.all([
				connector._getChapters({ id: 'a' }),
				connector._getChapters({ id: 'b' }),
			]);
			await vi.advanceTimersByTimeAsync(10_000);
			await both;

			const [first, second] = site.requests
				.filter(({ request }) => request.url.includes('/rest/v1/chapters'))
				.map(({ at }) => at);
			expect(second - first).toBeGreaterThanOrEqual(2000);
		});

		test('429 waits retryAfterSeconds and retries', async () => {
			vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
			const chapters = readFixture('chapters.json');
			const { connector, site } = await initializedConnector(
				siteRoutes({
					[CHAPTERS]: [json({ retryAfterSeconds: 3 }, 429), json(chapters)],
				}),
			);

			const result = connector._getChapters({ id: chapters[0].work_id });
			await vi.advanceTimersByTimeAsync(2999);
			expect(site.requestsTo('/rest/v1/chapters')).toHaveLength(1);
			await vi.advanceTimersByTimeAsync(1);
			// The retry re-enters the 0 ms pacing slot scheduled at t=3000.
			await vi.runOnlyPendingTimersAsync();

			expect(await result).toHaveLength(chapters.length);
			expect(site.requestsTo('/rest/v1/chapters')).toHaveLength(2);
		});

		test('429 gives up after 2 retries', async () => {
			vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
			const tooMany = () => json({ retryAfterSeconds: 1 }, 429);
			const { connector, site } = await initializedConnector(
				siteRoutes({ [CHAPTERS]: tooMany }),
			);

			const result = connector._getChapters({ id: 'work-1' });
			const settled = expect(result).rejects.toThrow('429');
			await vi.advanceTimersByTimeAsync(10_000);

			await settled;
			expect(site.requestsTo('/rest/v1/chapters')).toHaveLength(3);
		});

		test('5xx is retried once and the next answer returned', async () => {
			vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
			const chapters = readFixture('chapters.json');
			const { connector, site } = await initializedConnector(
				siteRoutes({ [CHAPTERS]: [json('', 503), json(chapters)] }),
			);

			const result = connector._getChapters({ id: chapters[0].work_id });
			await vi.advanceTimersByTimeAsync(10_000);

			expect(await result).toHaveLength(chapters.length);
			expect(site.requestsTo('/rest/v1/chapters')).toHaveLength(2);
		});
	});
});

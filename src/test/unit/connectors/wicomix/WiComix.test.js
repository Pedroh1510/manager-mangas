import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import WiComix from '../../../../connectors/wicomix/WiComix.js';

const FIXTURES = new URL('../../../fixtures/wicomix/', import.meta.url);
const readFixture = (name) => readFileSync(new URL(name, FIXTURES), 'utf8');

const SITE = 'https://loobyt.org';
const LASTMOD = '2026-10-24T20:00:00.000Z';

const answer = (body, status = 200) => ({ status, body });

/**
 * Answers by `METHOD origin+pathname`; a handler may be a canned answer, a
 * list consumed one per request, or a function of the Request. `fallback`
 * answers every unrouted request.
 */
class FakeWiComixSite {
	constructor(routes, fallback = () => answer('', 404)) {
		this.routes = routes;
		this.fallback = fallback;
		this.requests = [];
	}

	fetch = async (request) => {
		this.requests.push({ request, at: Date.now() });
		const url = new URL(request.url);
		const handler =
			this.routes[`${request.method} ${url.origin}${url.pathname}`] ??
			this.fallback;
		const { status, body } = this._answer(handler, request);
		return { status, statusText: String(status), text: async () => body };
	};

	_answer(handler, request) {
		if (Array.isArray(handler)) return handler.shift();
		if (typeof handler === 'function') return handler(request);
		return handler;
	}

	paths() {
		return this.requests.map(({ request }) => new URL(request.url).pathname);
	}

	workPageRequests() {
		return this.paths().filter((p) => p.startsWith('/manga/')).length;
	}
}

class FakeIndexStore {
	constructor(entries = {}) {
		this.entries = entries;
		this.saves = [];
		this.events = [];
		this.observe = () => undefined;
	}

	async load() {
		return structuredClone(this.entries);
	}

	// Records the save only a macrotask later, so a caller that does not await
	// it resolves first and C11 sees 'resolved' before 'save'.
	async save(entries) {
		const snapshot = structuredClone(entries);
		const seen = this.observe();
		await new Promise((resolve) => setTimeout(resolve, 0));
		this.saves.push({ entries: snapshot, seen });
		this.events.push('save');
	}

	lastSave() {
		return this.saves.at(-1).entries;
	}
}

class FakeLogger {
	warnings = [];
	warn(message) {
		this.warnings.push(JSON.parse(message));
	}
}

function buildConnector(
	routes,
	{ fallback, requestDelayMs = 0, index = {} } = {},
) {
	const site = new FakeWiComixSite(routes, fallback);
	const indexStore = new FakeIndexStore(index);
	const logger = new FakeLogger();
	vi.stubGlobal('fetch', site.fetch);
	const connector = new WiComix({ requestDelayMs, logger, indexStore });
	return { connector, site, indexStore, logger };
}

const sitemapIndex = (...paths) =>
	`<?xml version="1.0" encoding="UTF-8"?><sitemapindex>${paths
		.map((p) => `<sitemap><loc>${SITE}${p}</loc></sitemap>`)
		.join('')}</sitemapindex>`;

const urlset = (...slugs) =>
	`<?xml version="1.0" encoding="UTF-8"?><urlset>${slugs
		.map(([slug, lastmod = LASTMOD]) => [slug, lastmod])
		.map(
			([slug, lastmod]) =>
				`<url><loc>${SITE}/manga/${slug}</loc><lastmod>${lastmod}</lastmod></url>`,
		)
		.join('')}</urlset>`;

const chapter = (number, extra = {}) => ({
	id: `c-${number}`,
	number,
	title: `Capítulo ${number}`,
	slug: `capitulo-${String(number).replace('.', '-')}`,
	language: 'pt-br',
	type: 'images',
	status: 'approved',
	page_count: 3,
	locked: false,
	...extra,
});

function comicPage(slug, comic = {}, chapters = []) {
	const row = {
		id: `u-${slug}`,
		slug,
		title: `Obra ${slug}`,
		title_alt: '$1c',
		type: 'manhwa',
		is_adult: false,
		chapter_count: chapters.length,
		cover_url: `https://picture.mangalivre.org/temp/${slug}.jpg`,
		...comic,
	};
	const flight = [
		`1b:${JSON.stringify(row)}`,
		`1c:${JSON.stringify(comic.altTitles ?? [])}`,
		`5:${JSON.stringify(['$', 'div', null, { chapters }])}`,
		'',
	].join('\n');
	return `<html><body><script>self.__next_f.push(${JSON.stringify([1, flight])})</script></body></html>`;
}

const comicFallback = (request) => {
	const slug = new URL(request.url).pathname.match(/^\/manga\/(.+)$/)?.[1];
	return slug ? answer(comicPage(slug)) : answer('', 404);
};

// One sitemap holding the given slugs.
const oneSitemap = (...slugs) => ({
	[`GET ${SITE}/sitemap.xml`]: answer(sitemapIndex('/sitemaps/manga-0.xml')),
	[`GET ${SITE}/sitemaps/manga-0.xml`]: answer(urlset(...slugs)),
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('WiComix', () => {
	test('sets id, label and base url', () => {
		const connector = new WiComix({ indexStore: new FakeIndexStore() });

		expect(connector.id).toBe('wicomix');
		expect(connector.label).toBe('WiComix');
		expect(connector.url).toBe(SITE);
		expect(connector.tags).toEqual(['manhwa', 'portuguese']);
	});

	describe('catalog', () => {
		test('catalog reads every manga sitemap in index order', async () => {
			const index = readFixture('sitemap.xml');
			const expected = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)]
				.map(([, loc]) => new URL(loc).pathname)
				.filter((p) => /^\/sitemaps\/manga-\d+\.xml$/.test(p));
			const { connector, site } = buildConnector(
				{ [`GET ${SITE}/sitemap.xml`]: answer(index) },
				{
					fallback: (request) =>
						new URL(request.url).pathname.startsWith('/sitemaps/')
							? answer(urlset(['obra-unica']))
							: comicFallback(request),
				},
			);

			await connector._getMangas();

			const paths = site.paths();
			expect(expected).toHaveLength(134);
			expect(paths[0]).toBe('/sitemap.xml');
			expect(paths.filter((p) => p.startsWith('/sitemaps/'))).toEqual(expected);
			expect(paths).not.toContain('/sitemaps/static.xml');
			expect(paths).not.toContain('/sitemaps/generos.xml');
		});

		test('catalog fails before work pages when a sitemap fails', async () => {
			vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
			const { connector, site } = buildConnector(
				{
					[`GET ${SITE}/sitemap.xml`]: answer(
						sitemapIndex('/sitemaps/manga-0.xml', '/sitemaps/manga-1.xml'),
					),
					[`GET ${SITE}/sitemaps/manga-0.xml`]: answer(urlset(['a'])),
					[`GET ${SITE}/sitemaps/manga-1.xml`]: () => answer('', 503),
				},
				{ fallback: comicFallback },
			);

			const result = connector._getMangas();
			const settled = expect(result).rejects.toThrow(
				`${SITE}/sitemaps/manga-1.xml answered 503`,
			);
			await vi.advanceTimersByTimeAsync(20_000);
			await settled;

			expect(site.workPageRequests()).toBe(0);
		});

		test('catalog entry uses slug, title, cover and alt titles', async () => {
			const { connector } = buildConnector({
				...oneSitemap(
					['contrato-de-mercenario'],
					['um-verao-sem-fim'],
					['sem-capa'],
				),
				[`GET ${SITE}/manga/contrato-de-mercenario`]: answer(
					readFixture('manga-contrato-de-mercenario.html'),
				),
				[`GET ${SITE}/manga/um-verao-sem-fim`]: answer(
					readFixture('manga-um-verao-sem-fim.html'),
				),
				[`GET ${SITE}/manga/sem-capa`]: answer(
					comicPage('sem-capa', { cover_url: '' }),
				),
			});

			const [contrato, verao, semCapa] = await connector._getMangas();

			expect(contrato).toEqual({
				id: 'contrato-de-mercenario',
				title: 'Contrato de Mercenário',
				coverUrl:
					'https://picture.mangalivre.org/temp/1786540978812164343_9171d8c4-7268-431d-a4f4-d1d27d70225b.jpg',
				altTitles: ['Mercenary Enrollment'],
			});
			expect(verao.id).toBe('um-verao-sem-fim');
			expect(verao).not.toHaveProperty('altTitles');
			expect(semCapa).toEqual({ id: 'sem-capa', title: 'Obra sem-capa' });
		});

		test('novel works are left out of the catalog', async () => {
			const { connector } = buildConnector(
				{
					...oneSitemap(['romance'], ['livro']),
					[`GET ${SITE}/manga/livro`]: answer(
						comicPage('livro', { type: 'novel' }),
					),
				},
				{ fallback: comicFallback },
			);

			const ids = (await connector._getMangas()).map(({ id }) => id);

			expect(ids).toEqual(['romance']);
		});

		test('adult works are catalogued normally', async () => {
			const { connector } = buildConnector({
				...oneSitemap(['adulto']),
				[`GET ${SITE}/manga/adulto`]: answer(
					comicPage('adulto', {
						type: 'pornhwa',
						is_adult: true,
						title: 'Obra Adulta',
					}),
				),
			});

			const [entry] = await connector._getMangas();

			expect(entry).toMatchObject({ id: 'adulto', title: 'Obra Adulta' });
		});

		test('catalog drops a slug repeated across sitemaps', async () => {
			const { connector, site } = buildConnector(
				{
					[`GET ${SITE}/sitemap.xml`]: answer(
						sitemapIndex('/sitemaps/manga-0.xml', '/sitemaps/manga-1.xml'),
					),
					[`GET ${SITE}/sitemaps/manga-0.xml`]: answer(urlset(['a'], ['b'])),
					[`GET ${SITE}/sitemaps/manga-1.xml`]: answer(urlset(['b'])),
				},
				{ fallback: comicFallback },
			);

			const ids = (await connector._getMangas()).map(({ id }) => id);

			expect(ids).toEqual(['a', 'b']);
			expect(site.paths().filter((p) => p === '/manga/b')).toHaveLength(1);
		});
	});

	describe('incremental sync', () => {
		test('unchanged lastmod reuses the index entry', async () => {
			const { connector, site } = buildConnector(oneSitemap(['a']), {
				fallback: comicFallback,
				index: { a: { lastmod: LASTMOD, title: 'Antigo', novel: false } },
			});

			const [entry] = await connector._getMangas();

			expect(site.workPageRequests()).toBe(0);
			expect(entry).toEqual({ id: 'a', title: 'Antigo' });
		});

		test('new or changed lastmod refetches the work page', async () => {
			const { connector, site, indexStore } = buildConnector(
				oneSitemap(['velha', '2026-10-25T00:00:00.000Z'], ['nova']),
				{
					fallback: comicFallback,
					index: { velha: { lastmod: LASTMOD, title: 'Antigo', novel: false } },
				},
			);

			await connector._getMangas();

			expect(site.paths().filter((p) => p === '/manga/velha')).toHaveLength(1);
			expect(site.paths().filter((p) => p === '/manga/nova')).toHaveLength(1);
			expect(indexStore.lastSave()).toMatchObject({
				velha: { lastmod: '2026-10-25T00:00:00.000Z', title: 'Obra velha' },
				nova: { lastmod: LASTMOD, title: 'Obra nova' },
			});
		});

		test('slugs gone from the sitemap are dropped', async () => {
			const { connector, indexStore } = buildConnector(oneSitemap(['a']), {
				fallback: comicFallback,
				index: { sumiu: { lastmod: LASTMOD, title: 'Sumiu', novel: false } },
			});

			const ids = (await connector._getMangas()).map(({ id }) => id);

			expect(ids).toEqual(['a']);
			expect(indexStore.lastSave()).not.toHaveProperty('sumiu');
		});

		test('index is checkpointed every 100 work pages', async () => {
			const slugs = Array.from({ length: 250 }, (_, i) => [`obra-${i}`]);
			const { connector, site, indexStore } = buildConnector(
				oneSitemap(...slugs),
				{ fallback: comicFallback },
			);
			indexStore.observe = () => site.workPageRequests();

			await connector._getMangas();

			expect(indexStore.saves).toHaveLength(3);
			const [first, second, last] = indexStore.saves;
			expect(first.seen).toBe(100);
			expect(Object.keys(first.entries)).toHaveLength(100);
			expect(second.seen).toBe(200);
			expect(Object.keys(second.entries)).toHaveLength(200);
			expect(last.seen).toBe(250);
			expect(Object.keys(last.entries)).toHaveLength(250);
		});

		test('index is saved before the catalog is returned', async () => {
			const { connector, indexStore } = buildConnector(
				oneSitemap(['a'], ['b']),
				{ fallback: comicFallback },
			);

			const mangas = await connector._getMangas();
			indexStore.events.push('resolved');

			expect(indexStore.events).toEqual(['save', 'resolved']);
			expect(Object.keys(indexStore.lastSave())).toEqual(
				mangas.map(({ id }) => id),
			);
		});

		test('a failed work page is skipped with a warning', async () => {
			const slugs = Array.from({ length: 27 }, (_, i) => [`ok-${i}`]);
			const { connector, indexStore, logger } = buildConnector(
				{
					...oneSitemap(
						...slugs,
						['com-entrada', '2026-10-25T00:00:00.000Z'],
						['sem-entrada'],
						['sem-linha'],
					),
					[`GET ${SITE}/manga/com-entrada`]: answer('', 404),
					[`GET ${SITE}/manga/sem-entrada`]: answer('', 404),
					[`GET ${SITE}/manga/sem-linha`]: answer('<html></html>'),
				},
				{
					fallback: comicFallback,
					index: {
						'com-entrada': { lastmod: LASTMOD, title: 'Antigo', novel: false },
					},
				},
			);

			const mangas = await connector._getMangas();

			const ids = mangas.map(({ id }) => id);
			expect(ids).toContain('com-entrada');
			expect(ids).not.toContain('sem-entrada');
			expect(ids).not.toContain('sem-linha');
			expect(mangas.find(({ id }) => id === 'com-entrada').title).toBe(
				'Antigo',
			);
			expect(indexStore.lastSave()['com-entrada']).toEqual({
				lastmod: LASTMOD,
				title: 'Antigo',
				novel: false,
			});
			expect(logger.warnings).toEqual([
				expect.objectContaining({
					event: 'wicomix_manga_skipped',
					slug: 'com-entrada',
					error: expect.stringContaining('404'),
				}),
				expect.objectContaining({
					event: 'wicomix_manga_skipped',
					slug: 'sem-entrada',
					error: expect.stringContaining('404'),
				}),
				expect.objectContaining({
					event: 'wicomix_manga_skipped',
					slug: 'sem-linha',
					error: expect.stringContaining('no comic row'),
				}),
			]);
		});

		test('more than 10 percent failures rejects after saving', async () => {
			const build = (failing) => {
				const slugs = Array.from({ length: 20 }, (_, i) => [`obra-${i}`]);
				return buildConnector(oneSitemap(...slugs), {
					fallback: (request) =>
						Number(new URL(request.url).pathname.split('-')[1]) < failing
							? answer('', 404)
							: comicFallback(request),
				});
			};

			const over = build(3);
			await expect(over.connector._getMangas()).rejects.toThrow(
				'3 of 20 work pages failed, limit is 2',
			);
			expect(over.indexStore.saves).toHaveLength(1);
			expect(Object.keys(over.indexStore.lastSave())).toHaveLength(17);

			const atLimit = build(2);
			expect(await atLimit.connector._getMangas()).toHaveLength(18);
		});
	});

	describe('chapters', () => {
		const contrato = () => ({
			[`GET ${SITE}/manga/contrato-de-mercenario`]: answer(
				readFixture('manga-contrato-de-mercenario.html'),
			),
		});

		test('chapters come from one work page request', async () => {
			const { connector, site } = buildConnector(contrato());

			await connector._getChapters({ id: 'contrato-de-mercenario' });

			expect(site.paths()).toEqual(['/manga/contrato-de-mercenario']);
		});

		test('chapter entries use slug ids in ascending order', async () => {
			const { connector } = buildConnector(contrato());

			const chapters = await connector._getChapters({
				id: 'contrato-de-mercenario',
			});

			expect(chapters).toHaveLength(281);
			expect(chapters[0]).toEqual({
				id: 'contrato-de-mercenario/capitulo-0',
				title: 'Cap. 0',
				language: 'pt',
			});
			expect(chapters.at(-1)).toEqual({
				id: 'contrato-de-mercenario/capitulo-280',
				title: 'Cap. 280',
				language: 'pt',
			});
			const numbers = chapters.map(({ title }) => Number(title.slice(5)));
			expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
			expect(new Set(chapters.map(({ id }) => id)).size).toBe(281);
		});

		test('locked, non-image and unapproved chapters are left out', async () => {
			const { connector } = buildConnector({
				[`GET ${SITE}/manga/x`]: answer(
					comicPage('x', {}, [
						chapter(3),
						chapter(4, { locked: true }),
						chapter(5, { type: 'text' }),
						chapter(6, { status: 'pending' }),
						chapter(2.5),
					]),
				),
			});

			const chapters = await connector._getChapters({ id: 'x' });

			expect(chapters).toEqual([
				{ id: 'x/capitulo-2-5', title: 'Cap. 2.5', language: 'pt' },
				{ id: 'x/capitulo-3', title: 'Cap. 3', language: 'pt' },
			]);
		});

		test('work page without a comic row rejects', async () => {
			const { connector } = buildConnector({
				[`GET ${SITE}/manga/sem-linha`]: answer('<html></html>'),
			});

			await expect(connector._getChapters({ id: 'sem-linha' })).rejects.toThrow(
				'sem-linha',
			);
		});
	});

	describe('pages', () => {
		test('pages are the chapter images in order', async () => {
			const { connector, site } = buildConnector({
				[`GET ${SITE}/read/um-verao-sem-fim/capitulo-1`]: answer(
					readFixture('read-um-verao-sem-fim-capitulo-1.html'),
				),
			});

			const pages = await connector._getPages({
				id: 'um-verao-sem-fim/capitulo-1',
			});

			expect(site.paths()).toEqual(['/read/um-verao-sem-fim/capitulo-1']);
			expect(pages).toHaveLength(27);
			expect(pages[0]).toBe(
				'https://picture.mangalivre.org/chapters/um-verao-sem-fim/1/1.jpg',
			);
			expect(pages.at(-1)).toMatch(/\/1\/27\.jpg$/);
			expect(pages.map((p) => Number(p.match(/\/(\d+)\.jpg$/)[1]))).toEqual(
				Array.from({ length: 27 }, (_, i) => i + 1),
			);
		});

		// Newer chapters (e.g. capitulo-102+) serve pages from /temp/*.webp,
		// which failed connector-wicomix listPages jobs on 2026-10-25.
		test('newer chapters with /temp/ images are pages', async () => {
			const { connector } = buildConnector({
				[`GET ${SITE}/read/diario/capitulo-103`]: answer(
					readFixture('read-diario-de-dominancia-capitulo-103.html'),
				),
			});

			const pages = await connector._getPages({ id: 'diario/capitulo-103' });

			expect(pages).toHaveLength(25);
			expect(pages[0]).toBe(
				'https://picture.mangalivre.org/temp/1790836268691634_3b7a6f0798acf89a924936c1.webp',
			);
		});

		test('only chapter images are pages, made absolute', async () => {
			const { connector } = buildConnector({
				[`GET ${SITE}/read/x/capitulo-1`]: answer(
					'<img src="/favicon.png"><section><img src="/chapters/x/1/1.jpg"></section>',
				),
			});

			expect(await connector._getPages({ id: 'x/capitulo-1' })).toEqual([
				'https://loobyt.org/chapters/x/1/1.jpg',
			]);
		});

		test('work cover in /temp/ outside the pages section is not a page', async () => {
			const { connector } = buildConnector({
				[`GET ${SITE}/read/x/capitulo-1`]: answer(
					'<div><img class="ap-leitor__obra-capa" src="/temp/cover.jpg"></div>' +
						'<section><img src="/temp/1.webp"></section>',
				),
			});

			expect(await connector._getPages({ id: 'x/capitulo-1' })).toEqual([
				'https://loobyt.org/temp/1.webp',
			]);
		});

		test('reader page without images rejects', async () => {
			const { connector } = buildConnector({
				[`GET ${SITE}/read/x/capitulo-1`]: answer('<img src="/favicon.png">'),
			});

			const result = connector._getPages({ id: 'x/capitulo-1' });

			await expect(result).rejects.toThrow('x/capitulo-1');
			await expect(result).rejects.toThrow('no pages');
		});
	});

	describe('transport', () => {
		test('requests carry a browser user agent', async () => {
			const { connector, site } = buildConnector(
				{
					...oneSitemap(['a']),
					[`GET ${SITE}/read/a/capitulo-1`]: answer(
						'<section><img src="/chapters/a/1/1.jpg"></section>',
					),
				},
				{ fallback: comicFallback },
			);

			await connector._getMangas();
			await connector._getChapters({ id: 'a' });
			await connector._getPages({ id: 'a/capitulo-1' });

			expect(site.requests).toHaveLength(5);
			for (const { request } of site.requests) {
				const userAgent = request.headers.get('user-agent');
				expect(userAgent.startsWith('Mozilla/5.0')).toBe(true);
				expect(userAgent).toContain('Firefox/');
			}
		});

		test('requests are spaced 1000 ms apart across concurrent calls', async () => {
			vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
			const { connector, site } = buildConnector(
				{},
				{ fallback: comicFallback, requestDelayMs: 1000 },
			);

			const both = Promise.all([
				connector._getChapters({ id: 'a' }),
				connector._getChapters({ id: 'b' }),
			]);
			await vi.advanceTimersByTimeAsync(5000);
			await both;

			const [first, second] = site.requests.map(({ at }) => at);
			expect(second - first).toBeGreaterThanOrEqual(1000);
		});

		test('non-200 rejects with url and status', async () => {
			const { connector, site } = buildConnector({
				[`GET ${SITE}/manga/x`]: answer('', 404),
			});

			const result = connector._getChapters({ id: 'x' });

			await expect(result).rejects.toThrow(`${SITE}/manga/x`);
			await expect(result).rejects.toThrow('404');
			expect(site.requests).toHaveLength(1);
		});

		test('5xx is retried at most twice', async () => {
			vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
			const recovered = buildConnector({
				[`GET ${SITE}/manga/x`]: [
					answer('', 503),
					answer(comicPage('x', {}, [chapter(1)])),
				],
			});
			const recovering = recovered.connector._getChapters({ id: 'x' });
			await vi.advanceTimersByTimeAsync(20_000);
			expect(await recovering).toHaveLength(1);
			expect(recovered.site.requests).toHaveLength(2);

			const failing = buildConnector({
				[`GET ${SITE}/manga/y`]: () => answer('', 503),
			});
			const result = failing.connector._getChapters({ id: 'y' });
			const settled = expect(result).rejects.toThrow('503');
			await vi.advanceTimersByTimeAsync(20_000);
			await settled;
			expect(failing.site.requests).toHaveLength(3);
		});
	});
});

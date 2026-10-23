import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import BlitzToons from '../../../../connectors/blitztoons/BlitzToons.js';

const FIXTURES = new URL('../../../fixtures/blitztoons/', import.meta.url);
const readFixture = (name) => readFileSync(new URL(name, FIXTURES), 'utf8');

const SITE = 'https://blitztoons.com';
const CATALOG = `GET ${SITE}/obras`;

const html = (body, status = 200) => ({ status, body });

/**
 * Answers by `METHOD origin+pathname`; a handler may be a canned answer,
 * a list consumed one per request, or a function of the Request.
 */
class FakeBlitzToonsSite {
	constructor(routes) {
		this.routes = routes;
		this.requests = [];
	}

	fetch = async (request) => {
		this.requests.push({ request, at: Date.now() });
		const url = new URL(request.url);
		const handler =
			this.routes[`${request.method} ${url.origin}${url.pathname}`];
		const answer = this._answer(handler, request);
		const { status, body } = answer ?? { status: 404, body: '' };
		return { status, statusText: String(status), text: async () => body };
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

function buildConnector(
	routes,
	{ requestDelayMs = 0, logger = new FakeLogger() } = {},
) {
	const site = new FakeBlitzToonsSite(routes);
	vi.stubGlobal('fetch', site.fetch);
	const connector = new BlitzToons({ requestDelayMs, logger });
	return { connector, site, logger };
}

const card = (slug, cover = `https://cdn.blitztoons.com/covers/${slug}.webp`) =>
	`<article class="card">
<a class="card-cover" href="/obra/${slug}">
<img src="${cover}"
alt="Capa de ${slug}" loading="lazy">
</a>
<div class="card-body">
<h3 class="card-title"><a href="/obra/${slug}">Obra ${slug}</a></h3>
</div>
</article>`;
const catalogPage = (...cards) =>
	`<html><body><div class="grid-cards">${cards.join('')}</div></body></html>`;

const chapterItem = (num, { classes = '', inner = '' } = {}) =>
	`<li class="chap ${classes} "
data-num="${num}" data-cap="1${num}">
<a class="chap-alvo" href="/ler/x/${num}">Capítulo ${num}${inner}</a>
</li>`;
const obraPage = (...items) =>
	`<html><body><ul class="chaplist" data-chaplist data-slug="x">${items.join('')}</ul></body></html>`;

const pageParam = (request) => new URL(request.url).searchParams.get('p');

describe('BlitzToons', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	test('sets id, label and base url', () => {
		const connector = new BlitzToons();
		expect(connector.id).toBe('blitztoons');
		expect(connector.label).toBe('Blitz Toons');
		expect(connector.url).toBe(SITE);
	});

	describe('catalog', () => {
		const recordedPages = {
			1: readFixture('obras-p1.html'),
			2: readFixture('obras-p46.html'),
			3: readFixture('obras-empty.html'),
		};

		test('catalog pages alphabetically until an empty page', async () => {
			const { connector, site } = buildConnector({
				[CATALOG]: (request) => html(recordedPages[pageParam(request)] ?? ''),
			});

			const mangas = await connector._getMangas();

			const requests = site.requestsTo('/obras');
			expect(requests.map(pageParam)).toEqual(['1', '2', '3']);
			expect(
				requests.every(
					(request) =>
						new URL(request.url).searchParams.get('ordem') === 'alfabetica',
				),
			).toBe(true);
			expect(mangas).toHaveLength(33);
		});

		test('catalog entry uses the slug, title and cover', async () => {
			const { connector } = buildConnector({
				[CATALOG]: [
					html(
						recordedPages[1].replace(
							'</div>\n</article>',
							`</div>\n</article>${card('sem-capa', '')}`,
						),
					),
					html(recordedPages[3]),
				],
			});

			const mangas = await connector._getMangas();

			expect(mangas).toContainEqual({
				id: '30-anos-desde-o-prologo',
				title: '30 Anos Desde o Prólogo',
				coverUrl:
					'https://cdn.blitztoons.com/covers/30-anos-desde-o-prologo-12e8dea5f419.webp',
			});
			const noCover = mangas.find((manga) => manga.id === 'sem-capa');
			expect(noCover).toEqual({ id: 'sem-capa', title: 'Obra sem-capa' });
			expect(noCover).not.toHaveProperty('coverUrl');
		});

		test('catalog drops a slug repeated across pages', async () => {
			const { connector } = buildConnector({
				[CATALOG]: [
					html(catalogPage(card('a'), card('b'))),
					html(catalogPage(card('b'), card('c'))),
					html(catalogPage()),
				],
			});

			const mangas = await connector._getMangas();

			expect(mangas.map((manga) => manga.id)).toEqual(['a', 'b', 'c']);
		});

		test('catalog keeps paging past a page of unreadable cards', async () => {
			const unreadable =
				'<article class="card"><h3 class="card-title"><a href="/vip">VIP</a></h3></article>';
			const { connector, site } = buildConnector({
				[CATALOG]: [
					html(catalogPage(unreadable)),
					html(catalogPage(card('a'))),
					html(catalogPage()),
				],
			});

			const mangas = await connector._getMangas();

			expect(site.requestsTo('/obras')).toHaveLength(3);
			expect(mangas.map((manga) => manga.id)).toEqual(['a']);
		});

		test('catalog stops at the 200 page limit', async () => {
			const { connector, site } = buildConnector({
				[CATALOG]: (request) =>
					html(catalogPage(card(`s${pageParam(request)}`))),
			});

			await expect(connector._getMangas()).rejects.toThrow('200');
			expect(site.requestsTo('/obras')).toHaveLength(200);
		});
	});

	describe('chapters', () => {
		const OBRA = `GET ${SITE}/obra/doutor-i-a`;

		test('chapters come from one obra page request', async () => {
			const { connector, site } = buildConnector({
				[OBRA]: html(readFixture('obra-doutor-i-a.html')),
			});

			await connector._getChapters({ id: 'doutor-i-a' });

			expect(site.requests).toHaveLength(1);
			expect(site.requestsTo('/obra/doutor-i-a')).toHaveLength(1);
		});

		test('chapter entries use slug/num ids in ascending order', async () => {
			const { connector } = buildConnector({
				[OBRA]: html(readFixture('obra-doutor-i-a.html')),
			});

			const chapters = await connector._getChapters({ id: 'doutor-i-a' });

			expect(chapters).toHaveLength(86);
			expect(chapters[0]).toEqual({
				id: 'doutor-i-a/1',
				title: 'Cap. 1',
				language: 'pt',
			});
			expect(chapters.at(-1)).toEqual({
				id: 'doutor-i-a/164',
				title: 'Cap. 164',
				language: 'pt',
			});
			const numbers = chapters.map((chapter) =>
				Number(chapter.id.split('/')[1]),
			);
			expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
		});

		test('locked chapters are left out', async () => {
			const { connector } = buildConnector({
				[`GET ${SITE}/obra/x`]: html(
					obraPage(
						chapterItem(3, { classes: 'chap-locked' }),
						chapterItem(2, { inner: '<em class="lock-tag">VIP</em>' }),
						chapterItem(1),
					),
				),
			});

			const chapters = await connector._getChapters({ id: 'x' });

			expect(chapters).toEqual([
				{ id: 'x/1', title: 'Cap. 1', language: 'pt' },
			]);
		});

		test('invalid chapter numbers are skipped with a warning', async () => {
			const { connector, logger } = buildConnector({
				[`GET ${SITE}/obra/x`]: html(
					obraPage(chapterItem('10.5'), chapterItem(''), chapterItem(0)),
				),
			});

			const chapters = await connector._getChapters({ id: 'x' });

			expect(chapters).toEqual([
				{ id: 'x/0', title: 'Cap. 0', language: 'pt' },
			]);
			const warnings = logger.warnings.map((line) => JSON.parse(line));
			expect(warnings).toEqual([
				expect.objectContaining({
					event: 'blitztoons_chapter_skipped',
					slug: 'x',
					dataNum: '10.5',
				}),
				expect.objectContaining({
					event: 'blitztoons_chapter_skipped',
					slug: 'x',
					dataNum: '',
				}),
			]);
		});
	});

	describe('pages', () => {
		const READER = `GET ${SITE}/ler/doutor-i-a/163`;

		test('pages are the img.page sources in order', async () => {
			const { connector, site } = buildConnector({
				[READER]: html(readFixture('ler-doutor-i-a-163.html')),
			});

			const pages = await connector._getPages({ id: 'doutor-i-a/163' });

			expect(site.requestsTo('/ler/doutor-i-a/163')).toHaveLength(1);
			expect(pages).toHaveLength(44);
			expect(pages[0]).toBe(
				'https://cdn.blitztoons.com/chapters/879/163/001.webp?v=1792736075',
			);
			expect(pages.at(-1)).toBe(
				'https://cdn.blitztoons.com/chapters/879/163/044.webp?v=1792736075',
			);
		});

		test('relative page sources become absolute', async () => {
			const { connector } = buildConnector({
				[`GET ${SITE}/ler/x/1`]: html(
					'<div class="pages"><img class="page" src="/static/x.webp"></div>',
				),
			});

			const pages = await connector._getPages({ id: 'x/1' });

			expect(pages).toEqual(['https://blitztoons.com/static/x.webp']);
		});

		test('reader page without images rejects', async () => {
			const { connector } = buildConnector({
				[`GET ${SITE}/ler/x/1`]: html('<div class="lock-card">VIP</div>'),
			});

			const result = connector._getPages({ id: 'x/1' });

			await expect(result).rejects.toThrow('x/1');
			await expect(result).rejects.toThrow('no pages');
		});
	});

	describe('transport', () => {
		test('requests carry a browser user agent', async () => {
			const { connector, site } = buildConnector({
				[CATALOG]: [html(catalogPage(card('a'))), html(catalogPage())],
				[`GET ${SITE}/obra/a`]: html(obraPage(chapterItem(1))),
				[`GET ${SITE}/ler/a/1`]: html('<img class="page" src="/p.webp">'),
			});

			await connector._getMangas();
			await connector._getChapters({ id: 'a' });
			await connector._getPages({ id: 'a/1' });

			expect(site.requests).toHaveLength(4);
			for (const { request } of site.requests) {
				const userAgent = request.headers.get('user-agent');
				expect(userAgent.startsWith('Mozilla/5.0')).toBe(true);
				expect(userAgent).toContain('Firefox/');
			}
		});

		test('requests are spaced 1000 ms apart across concurrent calls', async () => {
			vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
			const { connector, site } = buildConnector(
				{
					[`GET ${SITE}/obra/a`]: html(obraPage()),
					[`GET ${SITE}/obra/b`]: html(obraPage()),
				},
				{ requestDelayMs: 1000 },
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

		test('default pacing keeps 1000 ms between requests', async () => {
			vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
			const site = new FakeBlitzToonsSite({
				[`GET ${SITE}/obra/a`]: html(obraPage()),
				[`GET ${SITE}/obra/b`]: html(obraPage()),
			});
			vi.stubGlobal('fetch', site.fetch);
			const connector = new BlitzToons({ logger: new FakeLogger() });

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
				[`GET ${SITE}/obra/x`]: html('', 404),
			});

			const result = connector._getChapters({ id: 'x' });

			await expect(result).rejects.toThrow('/obra/x');
			await expect(result).rejects.toThrow('404');
			expect(site.requests).toHaveLength(1);
		});

		test('5xx is retried at most twice', async () => {
			vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
			const recovered = buildConnector({
				[`GET ${SITE}/obra/x`]: [html('', 503), html(obraPage(chapterItem(1)))],
			});
			const recovering = recovered.connector._getChapters({ id: 'x' });
			await vi.advanceTimersByTimeAsync(20_000);
			expect(await recovering).toHaveLength(1);
			expect(recovered.site.requests).toHaveLength(2);

			const failing = buildConnector({
				[`GET ${SITE}/obra/y`]: () => html('', 503),
			});
			const result = failing.connector._getChapters({ id: 'y' });
			const settled = expect(result).rejects.toThrow('503');
			await vi.advanceTimersByTimeAsync(20_000);
			await settled;
			expect(failing.site.requests).toHaveLength(3);
		});
	});
});

import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
	COVER_MAX_BYTES,
	COVER_TIMEOUT_MS,
	createCoverDownloader,
} from '../../../service/covers/coverDownloader.js';
import { createCoverPaths } from '../../../service/covers/coverPaths.js';
import {
	createCoverService,
	staleCoverIds,
} from '../../../service/covers/coverService.js';
import { createNegativeCache } from '../../../service/covers/negativeCache.js';
import FakeCoverFetcher from '../../fakes/FakeCoverFetcher.js';
import FakeCoverStore from '../../fakes/FakeCoverStore.js';
import FakeImageServer from '../../fakes/FakeImageServer.js';
import FakeLogger from '../../fakes/FakeLogger.js';

const ROOT = '/root/appdata';
const HOUR_MS = 60 * 60 * 1000;
const paths = createCoverPaths(ROOT);

class FakeClock {
	now = 0;
	read = () => this.now;
	advance(ms) {
		this.now += ms;
	}
}

class RecordingDomainSlot {
	urls = [];
	run = (url, task) => {
		this.urls.push(url);
		return task();
	};
}

/** Arranges a cover service over in-memory fakes; any piece can be overridden. */
function arrangeService({
	catalogs = {},
	connectors = [],
	files = {},
	responses = {},
} = {}) {
	const fakes = {
		store: new FakeCoverStore(files),
		fetcher: new FakeCoverFetcher(responses),
		logger: new FakeLogger(),
		clock: new FakeClock(),
		slot: new RecordingDomainSlot(),
		catalogReads: [],
	};
	const service = createCoverService({
		paths,
		store: fakes.store,
		downloadCover: fakes.fetcher.download,
		withDomainSlot: fakes.slot.run,
		loadCatalog: async (pluginId) => {
			fakes.catalogReads.push(pluginId);
			return catalogs[pluginId] ?? null;
		},
		listConnectorsByManga: async () => connectors,
		now: fakes.clock.read,
		logger: fakes.logger,
	});
	return { service, ...fakes };
}

const COVER = Buffer.from('webp-a');
const OTHER_COVER = Buffer.from('webp-b');
const catalogKey = { pluginId: 'mangeek', idMangaPlugin: '1' };
const mangeekCatalog = [{ id: '1', title: 'A', coverUrl: 'https://h/a.jpg' }];

describe('cover downloader', () => {
	let server;
	beforeAll(async () => {
		server = await FakeImageServer.start();
	});
	afterAll(() => server.stop());

	test('downloads a 300px wide webp', async () => {
		const cover = await createCoverDownloader()(server.url('/cover.png'));

		const { format, width } = await sharp(cover).metadata();
		expect(format).toBe('webp');
		expect(width).toBe(300);
	});

	test('defaults to a 15s timeout and a 10 MB cap', () => {
		expect(COVER_TIMEOUT_MS).toBe(15_000);
		expect(COVER_MAX_BYTES).toBe(10 * 1024 * 1024);
	});

	test('rejects a failed download without writing a file: downloader rejects a non-2xx status', async () => {
		await expect(createCoverDownloader()(server.url('/404'))).rejects.toThrow();
	});

	test('rejects a failed download without writing a file: downloader bounds a default request at 15s and 10 MB', async () => {
		const requests = [];
		const recordRequest = async (config) => {
			requests.push(config);
			throw new Error('timeout of 15000ms exceeded');
		};

		await expect(
			createCoverDownloader({ request: recordRequest })('https://h/a.jpg'),
		).rejects.toThrow('timeout of 15000ms exceeded');

		expect(requests).toHaveLength(1);
		expect(requests[0]).toMatchObject({
			url: 'https://h/a.jpg',
			timeout: 15_000,
			maxContentLength: 10 * 1024 * 1024,
		});
		expect(requests[0].signal).toBeInstanceOf(AbortSignal);
	});

	test('rejects a failed download without writing a file: downloader rejects past the timeout', async () => {
		const downloadCover = createCoverDownloader({ timeoutMs: 200 });
		await expect(downloadCover(server.url('/hang'))).rejects.toThrow();
	});

	test('rejects a failed download without writing a file: downloader rejects a body over 10 MB', async () => {
		await expect(
			createCoverDownloader()(server.url('/huge')),
		).rejects.toThrow();
	});

	test('rejects a failed download without writing a file: downloader rejects a body sharp cannot decode', async () => {
		await expect(
			createCoverDownloader()(server.url('/html')),
		).rejects.toThrow();
	});
});

describe('cover paths', () => {
	test('derives the catalog cover path from a sha1 of the id', () => {
		const folder = path.join(ROOT, 'covers-catalog', 'mangeek');
		for (const id of ['../../etc/passwd', 'a/b', '1']) {
			const coverPath = paths.catalogCover('mangeek', id);
			expect(path.dirname(coverPath)).toBe(folder);
			expect(path.basename(coverPath)).toMatch(/^[0-9a-f]{40}\.webp$/);
		}
		expect(paths.catalogCover('mangeek', '1')).toBe(
			path.join(folder, '356a192b7913b04c54574d18c28d46e6395428ab.webp'),
		);
	});
});

describe('cover service: catalog covers', () => {
	const failures = [
		['upstream 500', new Error('Request failed with status code 500')],
		['timeout of 15s', new Error('timeout of 15000ms exceeded')],
		[
			'body over 10 MB',
			new Error('maxContentLength size of 10485760 exceeded'),
		],
		[
			'body sharp rejects',
			new Error('Input buffer contains unsupported image format'),
		],
	];

	test.each(failures)(
		'rejects a failed download without writing a file: %s',
		async (_, error) => {
			const { service, store, logger } = arrangeService({
				catalogs: { mangeek: mangeekCatalog },
				responses: { 'https://h/a.jpg': error },
			});

			expect(await service.getCatalogCover(catalogKey)).toBeNull();
			expect(store.writes).toEqual([]);
			expect(logger.warnings).toEqual([
				{
					status: 'capa_falhou',
					pluginId: 'mangeek',
					idMangaPlugin: '1',
					coverUrl: 'https://h/a.jpg',
					error: error.message,
				},
			]);
		},
	);

	test('stores and serves a downloaded catalog cover', async () => {
		const { service, store } = arrangeService({
			catalogs: { mangeek: mangeekCatalog },
			responses: { 'https://h/a.jpg': COVER },
		});

		expect(await service.getCatalogCover(catalogKey)).toEqual(COVER);
		expect(store.writes).toEqual([paths.catalogCover('mangeek', '1')]);
	});

	test('negative cache skips the upstream for 24h per key', async () => {
		const { service, fetcher, clock } = arrangeService({
			catalogs: {
				mangeek: [
					...mangeekCatalog,
					{ id: '2', title: 'B', coverUrl: 'https://h/b.jpg' },
				],
			},
			responses: {
				'https://h/a.jpg': new Error('down'),
				'https://h/b.jpg': new Error('down'),
			},
		});

		await service.getCatalogCover(catalogKey);
		clock.advance(24 * HOUR_MS - 60_000);
		expect(await service.getCatalogCover(catalogKey)).toBeNull();
		expect(fetcher.calls).toEqual(['https://h/a.jpg']);

		await service.getCatalogCover({ pluginId: 'mangeek', idMangaPlugin: '2' });
		expect(fetcher.calls).toEqual(['https://h/a.jpg', 'https://h/b.jpg']);

		clock.advance(2 * 60_000);
		await service.getCatalogCover(catalogKey);
		expect(fetcher.calls).toEqual([
			'https://h/a.jpg',
			'https://h/b.jpg',
			'https://h/a.jpg',
		]);
	});

	test('downloads inside the domain slot of the cover url', async () => {
		const { service, slot, fetcher } = arrangeService({
			catalogs: { mangeek: mangeekCatalog },
			responses: { 'https://h/a.jpg': COVER },
		});

		await service.getCatalogCover(catalogKey);

		expect(slot.urls).toEqual(['https://h/a.jpg']);
		expect(fetcher.calls).toEqual(['https://h/a.jpg']);
	});

	test('returns null without fetching when the catalog has no cover', async () => {
		const { service, fetcher } = arrangeService({
			catalogs: { mangeek: [{ id: '1', title: 'A' }] },
		});

		expect(await service.getCatalogCover(catalogKey)).toBeNull();
		expect(
			await service.getCatalogCover({
				pluginId: 'mangeek',
				idMangaPlugin: '9',
			}),
		).toBeNull();
		expect(
			await service.getCatalogCover({
				pluginId: 'nexustoons',
				idMangaPlugin: '1',
			}),
		).toBeNull();
		expect(fetcher.calls).toEqual([]);
	});
});

describe('cover service: local covers', () => {
	const localPath = paths.localCover(7);
	const connector = (idMangaConnector, idPlugin, isActive = true) => ({
		idMangaConnector,
		idPlugin,
		idMangaPlugin: '1',
		isActive,
	});

	test('serves an existing local cover without the catalog', async () => {
		const { service, fetcher, catalogReads } = arrangeService({
			files: { [localPath]: COVER },
			connectors: [connector(10, 'mangeek')],
			responses: { 'https://h/a.jpg': new Error('down') },
		});

		expect(await service.getLocalCover({ idManga: 7 })).toEqual(COVER);
		expect(catalogReads).toEqual([]);
		expect(fetcher.calls).toEqual([]);
	});

	test('tries active connectors oldest first and keeps the first that works', async () => {
		const { service, fetcher, store } = arrangeService({
			catalogs: {
				broken: [{ id: '1', title: 'A', coverUrl: 'https://h/broken.jpg' }],
				good: [{ id: '1', title: 'A', coverUrl: 'https://h/good.jpg' }],
				inactive: [{ id: '1', title: 'A', coverUrl: 'https://h/inactive.jpg' }],
			},
			connectors: [
				connector(11, 'good'),
				connector(9, 'inactive', false),
				connector(10, 'broken'),
			],
			responses: {
				'https://h/broken.jpg': new Error('down'),
				'https://h/good.jpg': COVER,
				'https://h/inactive.jpg': OTHER_COVER,
			},
		});

		expect(await service.getLocalCover({ idManga: 7 })).toEqual(COVER);
		expect(fetcher.calls).toEqual([
			'https://h/broken.jpg',
			'https://h/good.jpg',
		]);
		expect(await store.read(localPath)).toEqual(COVER);
	});

	test('copies the catalog cover cache into the local cover', async () => {
		const { service, fetcher, store } = arrangeService({
			files: { [paths.catalogCover('mangeek', '1')]: COVER },
			catalogs: { mangeek: mangeekCatalog },
			connectors: [connector(10, 'mangeek')],
		});

		expect(await service.getLocalCover({ idManga: 7 })).toEqual(COVER);
		expect(await store.read(localPath)).toEqual(COVER);
		expect(fetcher.calls).toEqual([]);
	});

	test.each([
		[
			'connector deactivated',
			[connector(10, 'mangeek', false)],
			mangeekCatalog,
		],
		[
			'active connector changed',
			[connector(10, 'mangeek', false), connector(11, 'nexustoons')],
			mangeekCatalog,
		],
		[
			'coverUrl changed',
			[connector(10, 'mangeek')],
			[{ id: '1', title: 'A', coverUrl: 'https://h/new.jpg' }],
		],
	])(
		'keeps the local cover fixed across connector changes: %s',
		async (_, connectors, catalog) => {
			const { service, fetcher } = arrangeService({
				files: { [localPath]: COVER },
				catalogs: {
					mangeek: catalog,
					nexustoons: [{ id: '1', title: 'A', coverUrl: 'https://h/n.jpg' }],
				},
				connectors,
				responses: {
					'https://h/new.jpg': OTHER_COVER,
					'https://h/n.jpg': OTHER_COVER,
				},
			});

			expect(await service.getLocalCover({ idManga: 7 })).toEqual(COVER);
			expect(fetcher.calls).toEqual([]);
		},
	);

	test('negative cache skips a manga without cover for 24h', async () => {
		const { service, fetcher, clock } = arrangeService({
			catalogs: {
				mangeek: [{ id: '1', title: 'A', coverUrl: 'https://h/a.jpg' }],
			},
			connectors: [connector(10, 'mangeek')],
			responses: { 'https://h/a.jpg': new Error('down') },
		});

		expect(await service.getLocalCover({ idManga: 7 })).toBeNull();
		clock.advance(24 * HOUR_MS - 60_000);
		expect(await service.getLocalCover({ idManga: 7 })).toBeNull();
		expect(fetcher.calls).toEqual(['https://h/a.jpg']);

		clock.advance(2 * 60_000);
		await service.getLocalCover({ idManga: 7 });
		expect(fetcher.calls).toEqual(['https://h/a.jpg', 'https://h/a.jpg']);
	});
});

describe('cover service: refreshLocalCover', () => {
	test('retries a manga whose earlier attempt failed', async () => {
		const connectors = [
			{
				idMangaConnector: 10,
				idPlugin: 'mangeek',
				idMangaPlugin: '9',
				isActive: true,
			},
		];
		const { service } = arrangeService({
			catalogs: { mangeek: mangeekCatalog },
			connectors,
			responses: { 'https://h/a.jpg': COVER },
		});
		expect(await service.getLocalCover({ idManga: 7 })).toBeNull();

		connectors.push({
			idMangaConnector: 11,
			idPlugin: 'mangeek',
			idMangaPlugin: '1',
			isActive: true,
		});

		expect(await service.getLocalCover({ idManga: 7 })).toBeNull();
		expect(await service.refreshLocalCover({ idManga: 7 })).toEqual(COVER);
	});
});

describe('negative cache', () => {
	test('forgets a key once ttlMs has passed', () => {
		const clock = new FakeClock();
		const failures = createNegativeCache({ ttlMs: 1000, now: clock.read });

		failures.add('k');
		clock.advance(999);
		expect(failures.has('k')).toBe(true);
		clock.advance(1);
		expect(failures.has('k')).toBe(false);
		expect(failures.has('other')).toBe(false);
	});
});

describe('staleCoverIds', () => {
	test('lists ids removed from the catalog or whose coverUrl changed', () => {
		const previous = [
			{ id: 'kept', coverUrl: 'u1' },
			{ id: 'changed', coverUrl: 'u2' },
			{ id: 'removed', coverUrl: 'u3' },
			{ id: 'gained', title: 'sem capa antes' },
		];
		const next = [
			{ id: 'kept', coverUrl: 'u1' },
			{ id: 'changed', coverUrl: 'u2-new' },
			{ id: 'gained', coverUrl: 'u4' },
		];

		expect(staleCoverIds(previous, next)).toEqual([
			'changed',
			'removed',
			'gained',
		]);
	});
});

import { afterEach, describe, expect, test, vi } from 'vitest';
import Connector from '../../../connectors/Connector.js';
import * as registry from '../../../connectors/registry.js';
import database from '../../../infra/database.js';
import logger from '../../../infra/logger.js';
import MangaService from '../../../service/manga.js';
import * as connectorQueue from '../../../service/queue/connectorQueue.js';
import * as mangaCatalog from '../../../utils/mangaCatalog.js';

vi.mock('../../../infra/database.js', () => ({
	default: { query: vi.fn() },
}));
vi.mock('../../../infra/logger.js', () => ({
	default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../../service/download.js', () => ({
	default: { downloadChapter: vi.fn() },
}));

class FakeConnector extends Connector {
	constructor() {
		super({ id: 'fake', label: 'Fake', tags: [], url: 'http://fake.invalid' });
	}

	async _getMangas() {
		return [{ id: '1', title: 'Black Clover' }];
	}

	async _getChapters(manga) {
		return [{ id: `${manga.id}-1`, title: 'Capítulo 01', language: 'pt' }];
	}
}

describe('MangaService', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('listMangas', () => {
		function arrangeFakePlugin() {
			vi.spyOn(registry, 'hasConnector').mockReturnValue(true);
			vi.spyOn(registry, 'getConnectorClass').mockReturnValue(FakeConnector);
			database.query.mockResolvedValue({ rows: [] });
		}

		test('returns the fresh cached catalog without enqueueing a refresh', async () => {
			arrangeFakePlugin();
			vi.spyOn(mangaCatalog, 'isStale').mockResolvedValue(false);
			vi.spyOn(mangaCatalog, 'loadCatalog').mockResolvedValue([
				{ id: '9', title: 'Cached Manga' },
			]);
			const enqueueSpy = vi
				.spyOn(connectorQueue, 'enqueueCatalogRefresh')
				.mockResolvedValue({});
			const enqueueAndWaitSpy = vi.spyOn(connectorQueue, 'enqueueAndWait');

			const result = await MangaService.listMangas({ pluginId: 'fake' });

			expect(result).toEqual([{ id: '9', title: 'Cached Manga' }]);
			expect(enqueueSpy).not.toHaveBeenCalled();
			expect(enqueueAndWaitSpy).not.toHaveBeenCalled();
		});

		test('returns the stale catalog without waiting for the refresh job', async () => {
			arrangeFakePlugin();
			vi.spyOn(mangaCatalog, 'isStale').mockResolvedValue(true);
			vi.spyOn(mangaCatalog, 'loadCatalog').mockResolvedValue([
				{ id: '9', title: 'Old Manga' },
			]);
			vi.spyOn(connectorQueue, 'enqueueCatalogRefresh').mockReturnValue(
				new Promise(() => {}),
			);

			const result = await MangaService.listMangas({ pluginId: 'fake' });

			expect(result).toEqual([{ id: '9', title: 'Old Manga' }]);
		});

		test('filters the stale catalog by title', async () => {
			arrangeFakePlugin();
			vi.spyOn(mangaCatalog, 'isStale').mockResolvedValue(true);
			vi.spyOn(mangaCatalog, 'loadCatalog').mockResolvedValue([
				{ id: '1', title: 'Black Clover' },
				{ id: '2', title: 'One Piece' },
			]);
			vi.spyOn(connectorQueue, 'enqueueCatalogRefresh').mockResolvedValue({});

			const result = await MangaService.listMangas({
				pluginId: 'fake',
				title: 'black',
			});

			expect(result).toEqual([{ id: '1', title: 'Black Clover' }]);
		});

		test('enqueues exactly one refreshCatalog job when the cache is stale', async () => {
			arrangeFakePlugin();
			vi.spyOn(mangaCatalog, 'isStale').mockResolvedValue(true);
			vi.spyOn(mangaCatalog, 'loadCatalog').mockResolvedValue([
				{ id: '9', title: 'Old Manga' },
			]);
			const enqueueSpy = vi
				.spyOn(connectorQueue, 'enqueueCatalogRefresh')
				.mockResolvedValue({});

			await MangaService.listMangas({ pluginId: 'fake' });

			expect(enqueueSpy).toHaveBeenCalledTimes(1);
			expect(enqueueSpy).toHaveBeenCalledWith('fake');
		});

		test('serves the stale catalog and logs when enqueueing the refresh fails', async () => {
			arrangeFakePlugin();
			vi.spyOn(mangaCatalog, 'isStale').mockResolvedValue(true);
			vi.spyOn(mangaCatalog, 'loadCatalog').mockResolvedValue([
				{ id: '9', title: 'Old Manga' },
			]);
			vi.spyOn(connectorQueue, 'enqueueCatalogRefresh').mockRejectedValue(
				new Error('redis down'),
			);

			const result = await MangaService.listMangas({ pluginId: 'fake' });

			expect(result).toEqual([{ id: '9', title: 'Old Manga' }]);
			await vi.waitFor(() =>
				expect(logger.error).toHaveBeenCalledWith(
					'catalog refresh enqueue failed',
					{ connectorId: 'fake', error: 'redis down' },
				),
			);
		});

		test('enqueues a refresh and reports pending when there is no cached catalog', async () => {
			arrangeFakePlugin();
			vi.spyOn(mangaCatalog, 'isStale').mockResolvedValue(true);
			vi.spyOn(mangaCatalog, 'loadCatalog').mockResolvedValue(null);
			const enqueueSpy = vi
				.spyOn(connectorQueue, 'enqueueCatalogRefresh')
				.mockResolvedValue({});

			const result = await MangaService.listMangas({ pluginId: 'fake' });

			expect(result).toBeNull();
			expect(enqueueSpy).toHaveBeenCalledTimes(1);
			expect(enqueueSpy).toHaveBeenCalledWith('fake');
		});

		test('treats an unparseable cache file as missing', async () => {
			arrangeFakePlugin();
			vi.spyOn(mangaCatalog, 'isStale').mockResolvedValue(false);
			vi.spyOn(mangaCatalog, 'loadCatalog').mockResolvedValue(null);
			const enqueueSpy = vi
				.spyOn(connectorQueue, 'enqueueCatalogRefresh')
				.mockResolvedValue({});

			const result = await MangaService.listMangas({ pluginId: 'fake' });

			expect(result).toBeNull();
			expect(enqueueSpy).toHaveBeenCalledTimes(1);
		});

		test('rejects when there is no cached catalog and enqueueing fails', async () => {
			arrangeFakePlugin();
			vi.spyOn(mangaCatalog, 'isStale').mockResolvedValue(true);
			vi.spyOn(mangaCatalog, 'loadCatalog').mockResolvedValue(null);
			vi.spyOn(connectorQueue, 'enqueueCatalogRefresh').mockRejectedValue(
				new Error('redis down'),
			);

			await expect(
				MangaService.listMangas({ pluginId: 'fake' }),
			).rejects.toThrow('redis down');
		});

		test('filters the catalog by title, case-insensitively, substring match', async () => {
			vi.spyOn(registry, 'hasConnector').mockReturnValue(true);
			vi.spyOn(registry, 'getConnectorClass').mockReturnValue(FakeConnector);
			vi.spyOn(mangaCatalog, 'isStale').mockResolvedValue(false);
			vi.spyOn(mangaCatalog, 'loadCatalog').mockResolvedValue([
				{ id: '1', title: 'Black Clover' },
				{ id: '2', title: 'One Piece' },
			]);
			database.query.mockResolvedValue({ rows: [] });

			const result = await MangaService.listMangas({
				pluginId: 'fake',
				title: 'black',
			});

			expect(result).toEqual([{ id: '1', title: 'Black Clover' }]);
		});

		test('throws when the plugin id is not registered', async () => {
			vi.spyOn(registry, 'hasConnector').mockReturnValue(false);

			await expect(
				MangaService.listMangas({ pluginId: 'unknown' }),
			).rejects.toThrow('Plugin with id unknown not found');
		});
	});

	describe('listChapters', () => {
		test('resolves the connector and routes the fetch through enqueueAndWait', async () => {
			vi.spyOn(registry, 'hasConnector').mockReturnValue(true);
			vi.spyOn(registry, 'getConnectorClass').mockReturnValue(FakeConnector);
			const enqueueAndWaitSpy = vi
				.spyOn(connectorQueue, 'enqueueAndWait')
				.mockResolvedValue([
					{ id: '7-1', title: 'Capítulo 01', language: 'pt' },
				]);
			database.query.mockResolvedValue({ rows: [] });

			const result = await MangaService.listChapters({
				pluginId: 'fake',
				mangaId: '7',
			});

			expect(enqueueAndWaitSpy).toHaveBeenCalledWith('fake', 'listChapters', {
				manga: { id: '7' },
			});
			expect(result).toEqual([
				{ id: '7-1', title: 'Capítulo 01', language: 'pt' },
			]);
		});
	});

	describe('downloadMangas', () => {
		test('looks up cookie/userAgent through mangaConnectors, not a chapters.pluginId column', async () => {
			database.query
				.mockResolvedValueOnce({
					rows: [{ cookie: 'abc', userAgent: 'ua' }],
				}) // cookie/userAgent lookup
				.mockResolvedValueOnce({ rows: [] }); // downloadedAt update

			await MangaService.downloadMangas({
				manga: 'Black Clover',
				chapter: '1',
				pages: [],
				idChapter: 42,
			});

			const [lookupCall, updateCall] = database.query.mock.calls;
			expect(lookupCall[0].text).toContain('"mangaConnectors"');
			expect(lookupCall[0].text).toContain('"pluginConfig"');
			expect(lookupCall[0].text).not.toContain('"pluginId"');
			expect(updateCall[0].text).toContain('"downloadedAt"');
		});
	});

	describe('hasConnector', () => {
		test('passes through to the registry', () => {
			vi.spyOn(registry, 'hasConnector').mockReturnValue(true);

			expect(MangaService.hasConnector('fake')).toBe(true);
		});
	});
});

import { afterEach, describe, expect, test, vi } from 'vitest';
import Connector from '../../../connectors/Connector.js';
import * as registry from '../../../connectors/registry.js';
import database from '../../../infra/database.js';
import MangaService from '../../../service/manga.js';
import * as connectorQueue from '../../../service/queue/connectorQueue.js';
import * as mangaCatalog from '../../../utils/mangaCatalog.js';

vi.mock('../../../infra/database.js', () => ({
	default: { query: vi.fn() },
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
		test('fetches fresh from the connector and saves the catalog when the cache is stale', async () => {
			vi.spyOn(registry, 'hasConnector').mockReturnValue(true);
			vi.spyOn(registry, 'getConnectorClass').mockReturnValue(FakeConnector);
			vi.spyOn(mangaCatalog, 'isStale').mockResolvedValue(true);
			const saveCatalogSpy = vi
				.spyOn(mangaCatalog, 'saveCatalog')
				.mockResolvedValue();
			const enqueueAndWaitSpy = vi
				.spyOn(connectorQueue, 'enqueueAndWait')
				.mockResolvedValue([{ id: '1', title: 'Black Clover' }]);
			database.query.mockResolvedValue({ rows: [] });

			const result = await MangaService.listMangas({ pluginId: 'fake' });

			expect(result).toEqual([{ id: '1', title: 'Black Clover' }]);
			expect(enqueueAndWaitSpy).toHaveBeenCalledWith('fake', 'listMangas', {});
			expect(saveCatalogSpy).toHaveBeenCalledWith('fake', [
				{ id: '1', title: 'Black Clover' },
			]);
		});

		test('reads from the cache without calling the connector when the cache is fresh', async () => {
			vi.spyOn(registry, 'hasConnector').mockReturnValue(true);
			vi.spyOn(registry, 'getConnectorClass').mockReturnValue(FakeConnector);
			vi.spyOn(mangaCatalog, 'isStale').mockResolvedValue(false);
			vi.spyOn(mangaCatalog, 'loadCatalog').mockResolvedValue([
				{ id: '9', title: 'Cached Manga' },
			]);
			const getMangasSpy = vi.spyOn(FakeConnector.prototype, '_getMangas');
			database.query.mockResolvedValue({ rows: [] });

			const result = await MangaService.listMangas({ pluginId: 'fake' });

			expect(result).toEqual([{ id: '9', title: 'Cached Manga' }]);
			expect(getMangasSpy).not.toHaveBeenCalled();
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

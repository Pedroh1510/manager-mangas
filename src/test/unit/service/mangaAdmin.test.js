import { afterEach, describe, expect, test, vi } from 'vitest';
import database from '../../../infra/database.js';
import logger from '../../../infra/logger.js';
import CoverService from '../../../service/covers/index.js';
import * as mangaServiceModule from '../../../service/manga.js';
import MangaAdminService from '../../../service/mangaAdmin.js';
import { enqueueCatalogRefresh } from '../../../service/queue/connectorQueue.js';

vi.mock('../../../infra/database.js', () => ({
	default: { query: vi.fn() },
}));

vi.mock('../../../service/queue/connectorQueue.js', async (importOriginal) => ({
	...(await importOriginal()),
	enqueueCatalogRefresh: vi.fn(),
}));

describe('MangaAdminService', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('createManga', () => {
		test('throws a BadRequestError when the title is already registered', async () => {
			database.query.mockResolvedValueOnce({
				rows: [{ idManga: 1, deletedAt: null }],
			});

			await expect(
				MangaAdminService.createManga({ title: 'Black Clover' }),
			).rejects.toMatchObject({
				message: 'This manga already exists in the database',
			});
		});

		test('throws a BadRequestError when the title belongs to a soft-deleted manga', async () => {
			database.query.mockResolvedValueOnce({
				rows: [{ idManga: 1, deletedAt: new Date() }],
			});

			await expect(
				MangaAdminService.createManga({ title: 'Black Clover' }),
			).rejects.toMatchObject({
				message: 'This manga already exists in the database history',
			});
		});

		test('inserts a new manga when the title is free', async () => {
			database.query
				.mockResolvedValueOnce({ rows: [] }) // findMangaByTitleIncludingDeleted
				.mockResolvedValueOnce({ rows: [{ idManga: 42 }] }); // insert

			const result = await MangaAdminService.createManga({
				title: 'Black Clover',
			});

			expect(result).toEqual({ idManga: 42 });
		});
	});

	describe('linkConnector', () => {
		test('throws a ValidationError when the connector is not registered', async () => {
			vi.spyOn(mangaServiceModule.default, 'hasConnector').mockReturnValue(
				false,
			);

			await expect(
				MangaAdminService.linkConnector({
					idManga: 1,
					idPlugin: 'unknown',
					idMangaPlugin: '1',
					titlePlugin: 'Black Clover',
				}),
			).rejects.toMatchObject({ message: 'Plugin with id unknown not found' });
		});

		test('inserts the link when everything is valid', async () => {
			vi.spyOn(mangaServiceModule.default, 'hasConnector').mockReturnValue(
				true,
			);
			database.query.mockResolvedValueOnce({ rows: [{ idMangaConnector: 7 }] });

			const result = await MangaAdminService.linkConnector({
				idManga: 1,
				idPlugin: 'fake',
				idMangaPlugin: '1',
				titlePlugin: 'Black Clover',
			});

			expect(result).toEqual({
				idMangaConnector: 7,
				idManga: 1,
				idPlugin: 'fake',
			});
		});
	});

	describe('linkConnector cover creation', () => {
		const linkArgs = {
			idManga: 1,
			idPlugin: 'fake',
			idMangaPlugin: '1',
			titlePlugin: 'Black Clover',
		};
		const linked = { idMangaConnector: 7, idManga: 1, idPlugin: 'fake' };

		function arrangeLink() {
			vi.spyOn(mangaServiceModule.default, 'hasConnector').mockReturnValue(
				true,
			);
			database.query.mockResolvedValueOnce({ rows: [{ idMangaConnector: 7 }] });
		}

		test('linkConnector fires the cover creation without awaiting it', async () => {
			arrangeLink();
			let releaseCover;
			const coverCreation = vi
				.spyOn(CoverService, 'refreshLocalCover')
				.mockReturnValue(
					new Promise((resolve) => {
						releaseCover = resolve;
					}),
				);

			const result = await MangaAdminService.linkConnector(linkArgs);

			expect(result).toEqual(linked);
			expect(coverCreation).toHaveBeenCalledTimes(1);
			expect(coverCreation).toHaveBeenCalledWith({ idManga: 1 });
			releaseCover(null);
		});

		test('linkConnector logs a failed cover creation and still resolves', async () => {
			arrangeLink();
			vi.spyOn(CoverService, 'refreshLocalCover').mockRejectedValue(
				new Error('boom'),
			);
			const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

			const result = await MangaAdminService.linkConnector(linkArgs);
			await vi.waitFor(() => expect(warn).toHaveBeenCalled());

			expect(result).toEqual(linked);
			expect(warn).toHaveBeenCalledWith({
				status: 'capa_falhou',
				idManga: 1,
				error: 'boom',
			});
		});
	});

	describe('setConnectorActive', () => {
		test('throws a BadRequestError when no matching link exists', async () => {
			database.query.mockResolvedValueOnce({ rows: [] });

			await expect(
				MangaAdminService.setConnectorActive({
					idManga: 1,
					idPlugin: 'fake',
					isActive: false,
				}),
			).rejects.toMatchObject({
				message: 'No connector link found for manga 1 and plugin fake',
			});
		});

		test('returns the updated link when found', async () => {
			database.query.mockResolvedValueOnce({ rows: [{ idMangaConnector: 7 }] });

			const result = await MangaAdminService.setConnectorActive({
				idManga: 1,
				idPlugin: 'fake',
				isActive: false,
			});

			expect(result).toEqual({ idMangaConnector: 7 });
		});
	});

	describe('setAllConnectorsActive', () => {
		test('throws a NotFoundError when the manga does not exist', async () => {
			database.query.mockResolvedValueOnce({ rows: [] });

			await expect(
				MangaAdminService.setAllConnectorsActive({
					idManga: 9,
					isActive: true,
				}),
			).rejects.toMatchObject({
				statusCode: 404,
				message: 'Manga 9 not found',
			});
			expect(database.query).toHaveBeenCalledTimes(1);
		});

		test('throws a NotFoundError when the manga is soft-deleted', async () => {
			database.query.mockResolvedValueOnce({
				rows: [{ idManga: 9, deletedAt: new Date() }],
			});

			await expect(
				MangaAdminService.setAllConnectorsActive({
					idManga: 9,
					isActive: true,
				}),
			).rejects.toMatchObject({
				statusCode: 404,
				message: 'Manga 9 not found',
			});
			expect(database.query).toHaveBeenCalledTimes(1);
		});

		test('throws a BadRequestError when the manga has no connector links', async () => {
			database.query
				.mockResolvedValueOnce({ rows: [{ idManga: 9, deletedAt: null }] })
				.mockResolvedValueOnce({ rowCount: 0, rows: [] });

			await expect(
				MangaAdminService.setAllConnectorsActive({
					idManga: 9,
					isActive: true,
				}),
			).rejects.toMatchObject({
				statusCode: 400,
				message: 'Manga 9 has no connector links',
			});
		});

		test('returns the number of links updated', async () => {
			database.query
				.mockResolvedValueOnce({ rows: [{ idManga: 9, deletedAt: null }] })
				.mockResolvedValueOnce({ rowCount: 3, rows: [] });

			const result = await MangaAdminService.setAllConnectorsActive({
				idManga: 9,
				isActive: false,
			});

			expect(result).toEqual({ idManga: 9, isActive: false, updated: 3 });
		});
	});

	describe('registerCookie', () => {
		test('throws a ValidationError when the connector is not registered', async () => {
			vi.spyOn(mangaServiceModule.default, 'hasConnector').mockReturnValue(
				false,
			);

			await expect(
				MangaAdminService.registerCookie({
					cookie: 'abc',
					idPlugin: 'unknown',
				}),
			).rejects.toMatchObject({ message: 'Plugin with id unknown not found' });
		});

		test('inserts a new pluginConfig row when none exists yet', async () => {
			vi.spyOn(mangaServiceModule.default, 'hasConnector').mockReturnValue(
				true,
			);
			database.query
				.mockResolvedValueOnce({ rows: [] }) // existing cookie lookup: none
				.mockResolvedValueOnce({ rows: [] }); // insert

			await MangaAdminService.registerCookie({
				cookie: 'abc',
				idPlugin: 'fake',
			});

			expect(database.query).toHaveBeenCalledTimes(2);
		});
	});

	describe('refreshConnectorCatalog', () => {
		test('enqueues a catalog refresh for a registered connector', async () => {
			vi.spyOn(mangaServiceModule.default, 'hasConnector').mockReturnValue(
				true,
			);
			enqueueCatalogRefresh.mockResolvedValueOnce({});

			const result = await MangaAdminService.refreshConnectorCatalog({
				idPlugin: 'nexustoons',
			});

			expect(enqueueCatalogRefresh).toHaveBeenCalledWith('nexustoons');
			expect(result).toEqual({ idPlugin: 'nexustoons' });
		});

		test('throws a NotFoundError naming the plugin when it is not registered', async () => {
			vi.spyOn(mangaServiceModule.default, 'hasConnector').mockReturnValue(
				false,
			);
			enqueueCatalogRefresh.mockClear();

			await expect(
				MangaAdminService.refreshConnectorCatalog({ idPlugin: 'nope' }),
			).rejects.toMatchObject({
				statusCode: 404,
				message: expect.stringContaining('"nope"'),
			});
			expect(enqueueCatalogRefresh).not.toHaveBeenCalled();
		});
	});
});

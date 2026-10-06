import { afterEach, describe, expect, test, vi } from 'vitest';
import database from '../../../infra/database.js';
import * as mangaServiceModule from '../../../service/manga.js';
import MangaAdminService from '../../../service/mangaAdmin.js';

vi.mock('../../../infra/database.js', () => ({
	default: { query: vi.fn() },
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
});

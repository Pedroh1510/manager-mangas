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

	describe('registerManga', () => {
		test('throws a ValidationError when the connector is not registered', async () => {
			vi.spyOn(mangaServiceModule.default, 'hasConnector').mockReturnValue(
				false,
			);

			await expect(
				MangaAdminService.registerManga({
					title: 'Black Clover',
					idPlugin: 'unknown',
					titlePlugin: 'Black Clover',
				}),
			).rejects.toMatchObject({ message: 'Plugin with id unknown not found' });
		});

		test('throws a BadRequestError when the title is already in historyManga', async () => {
			vi.spyOn(mangaServiceModule.default, 'hasConnector').mockReturnValue(
				true,
			);
			database.query.mockResolvedValueOnce({
				rows: [{ title: 'Black Clover' }],
			}); // listHistoryManga

			await expect(
				MangaAdminService.registerManga({
					title: 'Black Clover',
					idPlugin: 'fake',
					titlePlugin: 'Black Clover',
				}),
			).rejects.toMatchObject({
				message: 'This manga already exists in the database history',
			});
		});

		test('inserts a new manga and its plugin link when everything is valid', async () => {
			vi.spyOn(mangaServiceModule.default, 'hasConnector').mockReturnValue(
				true,
			);
			database.query
				.mockResolvedValueOnce({ rows: [] }) // listHistoryManga: not in history
				.mockResolvedValueOnce({ rows: [] }) // idManga lookup: not found yet
				.mockResolvedValueOnce({ rows: [{ idManga: 42 }] }) // insert into mangas
				.mockResolvedValueOnce({ rows: [] }); // insert into mangasPlugins

			const result = await MangaAdminService.registerManga({
				title: 'Black Clover',
				idPlugin: 'fake',
				titlePlugin: 'Black Clover',
			});

			expect(result).toEqual({ idManga: 42, idPlugin: 'fake' });
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

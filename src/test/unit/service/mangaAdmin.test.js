import { mkdir } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import database from '../../../infra/database.js';
import logger from '../../../infra/logger.js';
import { countPipelineEvent } from '../../../infra/telemetry/business.js';
import ChaptersRepository from '../../../repository/chapters.js';
import MangaConnectorsRepository from '../../../repository/mangaConnectors.js';
import MangasRepository from '../../../repository/mangas.js';
import AltTitlesService from '../../../service/altTitles.js';
import CoverService from '../../../service/covers/index.js';
import * as mangaServiceModule from '../../../service/manga.js';
import MangaAdminService from '../../../service/mangaAdmin.js';
import { enqueueBackgroundTask } from '../../../service/queue/backgroundQueue.js';
import { enqueueCatalogRefresh } from '../../../service/queue/connectorQueue.js';

vi.mock('../../../infra/database.js', () => ({
	default: { query: vi.fn() },
}));

vi.mock('../../../service/altTitles.js', () => ({
	default: { mergeFromLink: vi.fn() },
}));

// updateMangaChapters creates the manga's download folder; keep tests off disk.
vi.mock('node:fs/promises', async (importOriginal) => ({
	...(await importOriginal()),
	mkdir: vi.fn(),
}));

vi.mock('../../../infra/telemetry/business.js', () => ({
	countPipelineEvent: vi.fn(),
}));

vi.mock('../../../service/queue/backgroundQueue.js', () => ({
	enqueueBackgroundTask: vi.fn(),
}));

vi.mock('../../../service/queue/connectorQueue.js', async (importOriginal) => ({
	...(await importOriginal()),
	enqueueCatalogRefresh: vi.fn(),
}));

describe('MangaAdminService', () => {
	// restoreAllMocks also drops the mock's implementation after each test.
	beforeEach(() => {
		vi.mocked(AltTitlesService.mergeFromLink).mockResolvedValue(undefined);
	});

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

	describe('linkConnector alternative titles', () => {
		const linkArgs = {
			idManga: 1,
			idPlugin: 'fake',
			idMangaPlugin: '1',
			titlePlugin: 'Black Clover',
		};

		function arrangeLink() {
			vi.spyOn(mangaServiceModule.default, 'hasConnector').mockReturnValue(
				true,
			);
			database.query.mockResolvedValueOnce({ rows: [{ idMangaConnector: 7 }] });
		}

		test('linkConnector merges the linked item titles', async () => {
			arrangeLink();

			await MangaAdminService.linkConnector(linkArgs);

			expect(AltTitlesService.mergeFromLink).toHaveBeenCalledWith(linkArgs);
		});

		test('linkConnector logs a failed merge and still resolves', async () => {
			arrangeLink();
			vi.mocked(AltTitlesService.mergeFromLink).mockRejectedValueOnce(
				new Error('boom'),
			);
			const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

			const result = await MangaAdminService.linkConnector(linkArgs);

			expect(result).toEqual({
				idMangaConnector: 7,
				idManga: 1,
				idPlugin: 'fake',
			});
			expect(warn).toHaveBeenCalledWith({
				status: 'alt_titles_falhou',
				idManga: 1,
				idPlugin: 'fake',
				error: 'boom',
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

	describe('listChaptersMissing', () => {
		function arrangeConnectors() {
			vi.spyOn(
				MangaConnectorsRepository,
				'listConnectorsByManga',
			).mockResolvedValue([
				{
					idMangaConnector: 1,
					idPlugin: 'broken',
					idMangaPlugin: 'b',
					isActive: true,
				},
				{
					idMangaConnector: 2,
					idPlugin: 'healthy',
					idMangaPlugin: 'h',
					isActive: true,
				},
			]);
			vi.spyOn(ChaptersRepository, 'listChaptersByManga').mockResolvedValue([
				{ volume: '1.0000' },
			]);
			vi.spyOn(
				mangaServiceModule.default,
				'listChaptersByManga',
			).mockImplementation(async ({ idPlugin }) => {
				if (idPlugin === 'broken') throw new Error('paywall');
				return [
					{ id: 'h/1', title: 'Cap. 1', volume: '1.0000' },
					{ id: 'h/2', title: 'Cap. 2', volume: '2.0000' },
				];
			});
		}

		test('keeps chapters from healthy connectors when another connector fails', async () => {
			arrangeConnectors();
			vi.spyOn(logger, 'error').mockImplementation(() => {});

			const result = await MangaAdminService.listChaptersMissing({
				idManga: 9,
			});

			expect(result).toEqual([
				{
					id: 'h/2',
					title: 'Cap. 2',
					volume: '2.0000',
					idMangaConnector: 2,
					idPlugin: 'healthy',
				},
			]);
		});

		test('logs the failing connector instead of throwing', async () => {
			arrangeConnectors();
			const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

			await MangaAdminService.listChaptersMissing({ idManga: 9 });

			expect(errorSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					idManga: 9,
					idPlugin: 'broken',
					status: 'listChaptersMissing_connector_failed',
				}),
			);
		});
	});

	describe('updateMangaChapters', () => {
		const FAST = {
			idMangaConnector: 1,
			idPlugin: 'fast',
			idMangaPlugin: 'f',
			isActive: true,
		};
		const SLOW = {
			idMangaConnector: 2,
			idPlugin: 'slow',
			idMangaPlugin: 's',
			isActive: true,
		};

		function deferred() {
			let resolve;
			const promise = new Promise((done) => {
				resolve = done;
			});
			return { promise, resolve };
		}

		// Each connector answers through its own factory so a test can hold the
		// slow one back while the fast one has already responded.
		function arrangeManga({ answers, existingVolumes = [] }) {
			vi.spyOn(MangasRepository, 'findMangaById').mockResolvedValue({
				idManga: 9,
				title: 'Solo Leveling',
				deletedAt: null,
			});
			vi.spyOn(
				MangaConnectorsRepository,
				'listConnectorsByManga',
			).mockResolvedValue([FAST, SLOW]);
			vi.spyOn(ChaptersRepository, 'listChaptersByManga').mockResolvedValue(
				existingVolumes.map((volume) => ({ volume })),
			);
			vi.spyOn(
				mangaServiceModule.default,
				'listChaptersByManga',
			).mockImplementation(({ idPlugin }) => answers[idPlugin]());
		}

		// Mirrors UNIQUE(idManga, volume): the second insert of a volume
		// resolves undefined, like the swallowed duplicate-key error.
		function arrangeChaptersTable() {
			const taken = new Set();
			let nextId = 100;
			return vi
				.spyOn(ChaptersRepository, 'insertChapter')
				.mockImplementation(async ({ volume }) => {
					if (taken.has(volume)) return undefined;
					taken.add(volume);
					return { idChapter: nextId++ };
				});
		}

		function downloadsEnqueued() {
			return vi
				.mocked(enqueueBackgroundTask)
				.mock.calls.filter(([operation]) => operation === 'listPagesAndSend');
		}

		beforeEach(() => {
			vi.mocked(enqueueBackgroundTask).mockReset();
			vi.mocked(countPipelineEvent).mockReset();
			vi.mocked(mkdir).mockResolvedValue(undefined);
		});

		test('downloads a fast connector chapter before a slow connector answers', async () => {
			const slow = deferred();
			arrangeManga({
				answers: {
					fast: () =>
						Promise.resolve([{ id: 'f/1', title: 'Cap. 1', volume: '1' }]),
					slow: () => slow.promise,
				},
			});
			arrangeChaptersTable();

			const running = MangaAdminService.updateMangaChapters({ idManga: 9 });

			await vi.waitFor(() =>
				expect(enqueueBackgroundTask).toHaveBeenCalledWith(
					'listPagesAndSend',
					{ idChapter: 100 },
					'listPagesAndSend-100',
				),
			);
			slow.resolve([]);
			await running;
		});

		test('keeps the chapter of the first connector to answer when volumes collide', async () => {
			const slow = deferred();
			arrangeManga({
				answers: {
					fast: () =>
						Promise.resolve([{ id: 'f/1', title: 'Cap. 1', volume: '1' }]),
					slow: () => slow.promise,
				},
			});
			const insertSpy = arrangeChaptersTable();

			const running = MangaAdminService.updateMangaChapters({ idManga: 9 });
			await vi.waitFor(() => expect(insertSpy).toHaveBeenCalledTimes(1));
			slow.resolve([{ id: 's/1', title: 'Cap. 1', volume: '1' }]);
			const inserted = await running;

			expect(inserted).toEqual([
				expect.objectContaining({ idChapter: 100, idPlugin: 'fast' }),
			]);
			expect(downloadsEnqueued()).toHaveLength(1);
			expect(countPipelineEvent).toHaveBeenCalledTimes(1);
		});

		test('skips volumes the manga already has', async () => {
			arrangeManga({
				answers: {
					fast: () =>
						Promise.resolve([
							{ id: 'f/1', title: 'Cap. 1', volume: '1.0000' },
							{ id: 'f/2', title: 'Cap. 2', volume: '2.0000' },
						]),
					slow: () => Promise.resolve([]),
				},
				existingVolumes: ['1.0000'],
			});
			const insertSpy = arrangeChaptersTable();

			await MangaAdminService.updateMangaChapters({ idManga: 9 });

			expect(insertSpy).toHaveBeenCalledTimes(1);
			expect(insertSpy).toHaveBeenCalledWith(
				expect.objectContaining({ idChapterPlugin: 'f/2' }),
			);
		});

		test('still inserts the healthy connector chapters when another fails', async () => {
			vi.spyOn(logger, 'error').mockImplementation(() => {});
			arrangeManga({
				answers: {
					fast: () =>
						Promise.resolve([{ id: 'f/1', title: 'Cap. 1', volume: '1' }]),
					slow: () => Promise.reject(new Error('paywall')),
				},
			});
			arrangeChaptersTable();

			const inserted = await MangaAdminService.updateMangaChapters({
				idManga: 9,
			});

			expect(inserted).toHaveLength(1);
		});

		test('enqueues one download batch at the end to retry older failed downloads', async () => {
			arrangeManga({
				answers: {
					fast: () =>
						Promise.resolve([{ id: 'f/1', title: 'Cap. 1', volume: '1' }]),
					slow: () =>
						Promise.resolve([{ id: 's/2', title: 'Cap. 2', volume: '2' }]),
				},
			});
			arrangeChaptersTable();

			await MangaAdminService.updateMangaChapters({ idManga: 9 });

			const batches = vi
				.mocked(enqueueBackgroundTask)
				.mock.calls.filter(
					([operation]) => operation === 'downloadMangasBatch',
				);
			expect(batches).toEqual([
				['downloadMangasBatch', { idManga: 9 }, 'downloadMangasBatch-9'],
			]);
		});

		test('fails the job naming the manga when a link cannot record its chapters, after the other links finish', async () => {
			arrangeManga({
				answers: {
					fast: () =>
						Promise.resolve([{ id: 'f/1', title: 'Cap. 1', volume: '1' }]),
					slow: () =>
						Promise.resolve([{ id: 's/2', title: 'Cap. 2', volume: '2' }]),
				},
			});
			vi.spyOn(ChaptersRepository, 'insertChapter').mockImplementation(
				async ({ volume }) => {
					if (volume === '2') throw new Error('connection reset');
					return { idChapter: 100 };
				},
			);

			await expect(
				MangaAdminService.updateMangaChapters({ idManga: 9 }),
			).rejects.toThrow(/idManga 9.*connection reset/);
			expect(downloadsEnqueued()).toHaveLength(1);
			expect(enqueueBackgroundTask).toHaveBeenCalledWith(
				'downloadMangasBatch',
				{ idManga: 9 },
				'downloadMangasBatch-9',
			);
		});

		test('enqueues no download batch when nothing new was inserted', async () => {
			arrangeManga({
				answers: {
					fast: () => Promise.resolve([]),
					slow: () => Promise.resolve([]),
				},
			});
			arrangeChaptersTable();

			await MangaAdminService.updateMangaChapters({ idManga: 9 });

			expect(enqueueBackgroundTask).not.toHaveBeenCalled();
		});
	});
});

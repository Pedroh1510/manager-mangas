import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../../../infra/kavitaClient.js', () => ({
	default: {
		checkHealth: vi.fn(),
		authenticate: vi.fn(),
		searchSeries: vi.fn(),
		getSeriesVolumes: vi.fn(),
		scanSeries: vi.fn(),
	},
}));
// Mock the FULL repository surface (not just the read methods this job
// actually calls) so a future write call added here would fail loudly with
// "is not a function" instead of silently succeeding as an unmocked vi.fn().
vi.mock('../../../../repository/mangas.js', () => ({
	default: {
		listMangas: vi.fn(),
		findMangaById: vi.fn(),
		createManga: vi.fn(),
		findMangaByTitleIncludingDeleted: vi.fn(),
		softDeleteManga: vi.fn(),
	},
}));
vi.mock('../../../../repository/chapters.js', () => ({
	default: {
		listChaptersByManga: vi.fn(),
		insertChapter: vi.fn(),
		findChapterById: vi.fn(),
		deleteChapter: vi.fn(),
		deleteChaptersByManga: vi.fn(),
		markDownloaded: vi.fn(),
		listMissingDownloads: vi.fn(),
	},
}));
vi.mock('../../../../service/download.js', () => ({
	default: { deleteChapterFile: vi.fn() },
}));
vi.mock('../../../../infra/logger.js', () => ({
	default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const KavitaClient = (await import('../../../../infra/kavitaClient.js'))
	.default;
const MangasRepository = (await import('../../../../repository/mangas.js'))
	.default;
const ChaptersRepository = (await import('../../../../repository/chapters.js'))
	.default;
const Download = (await import('../../../../service/download.js')).default;
const KavitaCleanupService = (
	await import('../../../../service/kavita/cleanupReadChapters.js')
).default;

const manga = { idManga: 1, title: 'Black Clover' };
const downloadedAt = new Date('2026-01-01');

describe('KavitaCleanupService.cleanupReadChapters', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('aborts without touching anything when health check fails', async () => {
		KavitaClient.checkHealth.mockResolvedValue(false);

		const result = await KavitaCleanupService.cleanupReadChapters({});

		expect(result).toEqual({ totalDeleted: 0, mangasProcessed: 0 });
		expect(KavitaClient.authenticate).not.toHaveBeenCalled();
		expect(MangasRepository.listMangas).not.toHaveBeenCalled();
	});

	test('aborts without touching anything when authentication fails', async () => {
		KavitaClient.checkHealth.mockResolvedValue(true);
		KavitaClient.authenticate.mockResolvedValue(null);

		const result = await KavitaCleanupService.cleanupReadChapters({});

		expect(result).toEqual({ totalDeleted: 0, mangasProcessed: 0 });
		expect(MangasRepository.listMangas).not.toHaveBeenCalled();
	});

	test('skips a manga with no series match in Kavita, without failing the run', async () => {
		KavitaClient.checkHealth.mockResolvedValue(true);
		KavitaClient.authenticate.mockResolvedValue('jwt-123');
		MangasRepository.listMangas.mockResolvedValue([manga]);
		ChaptersRepository.listChaptersByManga.mockResolvedValue([
			{ idChapter: 1, volume: '1.0000', downloadedAt },
		]);
		KavitaClient.searchSeries.mockResolvedValue([]);

		const result = await KavitaCleanupService.cleanupReadChapters({});

		expect(result).toEqual({ totalDeleted: 0, mangasProcessed: 1 });
		expect(Download.deleteChapterFile).not.toHaveBeenCalled();
		expect(KavitaClient.scanSeries).not.toHaveBeenCalled();
	});

	test('deletes fully-read chapters, keeps the highest volume, and scans the series', async () => {
		KavitaClient.checkHealth.mockResolvedValue(true);
		KavitaClient.authenticate.mockResolvedValue('jwt-123');
		MangasRepository.listMangas.mockResolvedValue([manga]);
		ChaptersRepository.listChaptersByManga.mockResolvedValue([
			{ idChapter: 1, volume: '1.0000', downloadedAt },
			{ idChapter: 2, volume: '2.0000', downloadedAt },
		]);
		KavitaClient.searchSeries.mockResolvedValue([
			{ seriesId: 7, name: 'Black Clover', libraryId: 10 },
		]);
		KavitaClient.getSeriesVolumes.mockResolvedValue([
			{
				chapters: [
					{ minNumber: 1, pages: 20, pagesRead: 20 },
					{ minNumber: 2, pages: 20, pagesRead: 20 },
				],
			},
		]);

		const result = await KavitaCleanupService.cleanupReadChapters({});

		expect(result).toEqual({ totalDeleted: 1, mangasProcessed: 1 });
		expect(Download.deleteChapterFile).toHaveBeenCalledTimes(1);
		expect(Download.deleteChapterFile).toHaveBeenCalledWith({
			title: 'Black Clover',
			volume: '1.0000',
		});
		expect(KavitaClient.scanSeries).toHaveBeenCalledWith({
			libraryId: 10,
			seriesId: 7,
			token: 'jwt-123',
		});
	});

	test('keeps deleting other chapters and still scans when one file delete fails', async () => {
		KavitaClient.checkHealth.mockResolvedValue(true);
		KavitaClient.authenticate.mockResolvedValue('jwt-123');
		MangasRepository.listMangas.mockResolvedValue([manga]);
		ChaptersRepository.listChaptersByManga.mockResolvedValue([
			{ idChapter: 1, volume: '1.0000', downloadedAt },
			{ idChapter: 2, volume: '2.0000', downloadedAt },
			{ idChapter: 3, volume: '3.0000', downloadedAt },
		]);
		KavitaClient.searchSeries.mockResolvedValue([
			{ seriesId: 7, name: 'Black Clover', libraryId: 10 },
		]);
		KavitaClient.getSeriesVolumes.mockResolvedValue([
			{
				chapters: [
					{ minNumber: 1, pages: 20, pagesRead: 20 },
					{ minNumber: 2, pages: 20, pagesRead: 20 },
					{ minNumber: 3, pages: 20, pagesRead: 20 },
				],
			},
		]);
		Download.deleteChapterFile
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error('EACCES'));

		const result = await KavitaCleanupService.cleanupReadChapters({});

		expect(Download.deleteChapterFile).toHaveBeenCalledTimes(2);
		expect(result).toEqual({ totalDeleted: 1, mangasProcessed: 1 });
		expect(KavitaClient.scanSeries).toHaveBeenCalledTimes(1);
	});

	test('does not scan when no chapter was deleted for that manga', async () => {
		KavitaClient.checkHealth.mockResolvedValue(true);
		KavitaClient.authenticate.mockResolvedValue('jwt-123');
		MangasRepository.listMangas.mockResolvedValue([manga]);
		ChaptersRepository.listChaptersByManga.mockResolvedValue([
			{ idChapter: 1, volume: '1.0000', downloadedAt },
		]);
		KavitaClient.searchSeries.mockResolvedValue([
			{ seriesId: 7, name: 'Black Clover', libraryId: 10 },
		]);
		KavitaClient.getSeriesVolumes.mockResolvedValue([
			{ chapters: [{ minNumber: 1, pages: 20, pagesRead: 20 }] },
		]);

		await KavitaCleanupService.cleanupReadChapters({});

		expect(KavitaClient.scanSeries).not.toHaveBeenCalled();
	});

	test('finds no eligible chapters when nothing is downloaded and Kavita has no orphans', async () => {
		KavitaClient.checkHealth.mockResolvedValue(true);
		KavitaClient.authenticate.mockResolvedValue('jwt-123');
		MangasRepository.listMangas.mockResolvedValue([manga]);
		ChaptersRepository.listChaptersByManga.mockResolvedValue([
			{ idChapter: 1, volume: '1.0000', downloadedAt: null },
		]);
		KavitaClient.searchSeries.mockResolvedValue([
			{ seriesId: 7, name: 'Black Clover', libraryId: 10 },
		]);
		KavitaClient.getSeriesVolumes.mockResolvedValue([
			{ chapters: [{ minNumber: 1, pages: 20, pagesRead: 20 }] },
		]);

		const result = await KavitaCleanupService.cleanupReadChapters({});

		expect(result).toEqual({ totalDeleted: 0, mangasProcessed: 1 });
		expect(Download.deleteChapterFile).not.toHaveBeenCalled();
	});

	test('deletes an orphan Kavita chapter with no local database row', async () => {
		KavitaClient.checkHealth.mockResolvedValue(true);
		KavitaClient.authenticate.mockResolvedValue('jwt-123');
		MangasRepository.listMangas.mockResolvedValue([manga]);
		ChaptersRepository.listChaptersByManga.mockResolvedValue([
			{ idChapter: 1, volume: '2.0000', downloadedAt },
		]);
		KavitaClient.searchSeries.mockResolvedValue([
			{ seriesId: 7, name: 'Black Clover', libraryId: 10 },
		]);
		KavitaClient.getSeriesVolumes.mockResolvedValue([
			{
				chapters: [
					{ minNumber: 1, pages: 20, pagesRead: 20 }, // orphan
					{ minNumber: 2, pages: 20, pagesRead: 20 }, // local, highest
				],
			},
		]);

		const result = await KavitaCleanupService.cleanupReadChapters({});

		expect(result).toEqual({ totalDeleted: 1, mangasProcessed: 1 });
		expect(Download.deleteChapterFile).toHaveBeenCalledWith({
			title: 'Black Clover',
			volume: 1,
		});
	});

	test('cleans up by title alone, without a matching manga row in the database', async () => {
		KavitaClient.checkHealth.mockResolvedValue(true);
		KavitaClient.authenticate.mockResolvedValue('jwt-123');
		KavitaClient.searchSeries.mockResolvedValue([
			{ seriesId: 7, name: 'Black Clover', libraryId: 10 },
		]);
		KavitaClient.getSeriesVolumes.mockResolvedValue([
			{
				chapters: [
					{ minNumber: 1, pages: 20, pagesRead: 20 },
					{ minNumber: 2, pages: 20, pagesRead: 20 },
				],
			},
		]);

		const result = await KavitaCleanupService.cleanupReadChapters({
			title: 'Black Clover',
		});

		expect(MangasRepository.listMangas).not.toHaveBeenCalled();
		expect(MangasRepository.findMangaById).not.toHaveBeenCalled();
		expect(ChaptersRepository.listChaptersByManga).not.toHaveBeenCalled();
		expect(result).toEqual({ totalDeleted: 1, mangasProcessed: 1 });
		expect(Download.deleteChapterFile).toHaveBeenCalledWith({
			title: 'Black Clover',
			volume: 1,
		});
	});

	test('continues processing other mangas when one manga fails', async () => {
		const mangaTwo = { idManga: 2, title: 'One Piece' };
		KavitaClient.checkHealth.mockResolvedValue(true);
		KavitaClient.authenticate.mockResolvedValue('jwt-123');
		MangasRepository.listMangas.mockResolvedValue([manga, mangaTwo]);
		ChaptersRepository.listChaptersByManga
			.mockRejectedValueOnce(new Error('db exploded'))
			.mockResolvedValueOnce([
				{ idChapter: 3, volume: '1.0000', downloadedAt },
			]);
		KavitaClient.searchSeries.mockResolvedValue([]);

		const result = await KavitaCleanupService.cleanupReadChapters({});

		expect(result).toEqual({ totalDeleted: 0, mangasProcessed: 2 });
	});

	test('scopes to a single manga when idManga is given', async () => {
		KavitaClient.checkHealth.mockResolvedValue(true);
		KavitaClient.authenticate.mockResolvedValue('jwt-123');
		MangasRepository.findMangaById.mockResolvedValue(manga);
		ChaptersRepository.listChaptersByManga.mockResolvedValue([
			{ idChapter: 1, volume: '1.0000', downloadedAt: null },
		]);

		const result = await KavitaCleanupService.cleanupReadChapters({
			idManga: 1,
		});

		expect(MangasRepository.listMangas).not.toHaveBeenCalled();
		expect(MangasRepository.findMangaById).toHaveBeenCalledWith({ idManga: 1 });
		expect(result).toEqual({ totalDeleted: 0, mangasProcessed: 1 });
	});

	test('returns correct deletion count when scanSeries fails after deletions', async () => {
		KavitaClient.checkHealth.mockResolvedValue(true);
		KavitaClient.authenticate.mockResolvedValue('jwt-123');
		MangasRepository.listMangas.mockResolvedValue([manga]);
		ChaptersRepository.listChaptersByManga.mockResolvedValue([
			{ idChapter: 1, volume: '1.0000', downloadedAt },
			{ idChapter: 2, volume: '2.0000', downloadedAt },
		]);
		KavitaClient.searchSeries.mockResolvedValue([
			{ seriesId: 7, name: 'Black Clover', libraryId: 10 },
		]);
		KavitaClient.getSeriesVolumes.mockResolvedValue([
			{
				chapters: [
					{ minNumber: 1, pages: 20, pagesRead: 20 },
					{ minNumber: 2, pages: 20, pagesRead: 20 },
				],
			},
		]);
		Download.deleteChapterFile.mockResolvedValue(undefined);
		KavitaClient.scanSeries.mockRejectedValue(new Error('Network timeout'));

		const result = await KavitaCleanupService.cleanupReadChapters({});

		expect(result).toEqual({ totalDeleted: 1, mangasProcessed: 1 });
		expect(Download.deleteChapterFile).toHaveBeenCalledTimes(1);
		expect(KavitaClient.scanSeries).toHaveBeenCalledTimes(1);
	});

	test('never writes to the database, even during a run that deletes files', async () => {
		// Global constraint #1: this job only ever deletes on-disk chapter
		// files; it must never mutate the chapters/mangas tables. A run that
		// actually triggers deletions is the strongest case to prove this.
		KavitaClient.checkHealth.mockResolvedValue(true);
		KavitaClient.authenticate.mockResolvedValue('jwt-123');
		MangasRepository.listMangas.mockResolvedValue([manga]);
		ChaptersRepository.listChaptersByManga.mockResolvedValue([
			{ idChapter: 1, volume: '1.0000', downloadedAt },
			{ idChapter: 2, volume: '2.0000', downloadedAt },
		]);
		KavitaClient.searchSeries.mockResolvedValue([
			{ seriesId: 7, name: 'Black Clover', libraryId: 10 },
		]);
		KavitaClient.getSeriesVolumes.mockResolvedValue([
			{
				chapters: [
					{ minNumber: 1, pages: 20, pagesRead: 20 },
					{ minNumber: 2, pages: 20, pagesRead: 20 },
				],
			},
		]);

		const result = await KavitaCleanupService.cleanupReadChapters({});

		expect(result).toEqual({ totalDeleted: 1, mangasProcessed: 1 });
		expect(ChaptersRepository.deleteChapter).not.toHaveBeenCalled();
		expect(ChaptersRepository.deleteChaptersByManga).not.toHaveBeenCalled();
		expect(ChaptersRepository.markDownloaded).not.toHaveBeenCalled();
		expect(ChaptersRepository.insertChapter).not.toHaveBeenCalled();
		expect(MangasRepository.createManga).not.toHaveBeenCalled();
		expect(MangasRepository.softDeleteManga).not.toHaveBeenCalled();
	});
});

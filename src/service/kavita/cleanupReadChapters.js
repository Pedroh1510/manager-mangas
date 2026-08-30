import logger from '../../infra/logger.js';
import KavitaClient from '../../infra/kavitaClient.js';
import ChaptersRepository from '../../repository/chapters.js';
import MangasRepository from '../../repository/mangas.js';
import Download from '../download.js';
import { flattenKavitaChapters, selectChaptersToDelete } from './chapterEligibility.js';
import { findMatchingSeries } from './matchTitle.js';

async function ensureKavitaConnection() {
	const healthy = await KavitaClient.checkHealth();
	if (!healthy) {
		logger.warn({ status: 'kavita_cleanup_aborted', reason: 'health_check_failed' });
		return null;
	}
	const token = await KavitaClient.authenticate();
	if (!token) {
		logger.warn({ status: 'kavita_cleanup_aborted', reason: 'authenticate_failed' });
		return null;
	}
	return token;
}

async function deleteChapters({ manga, chapters }) {
	let deleted = 0;
	for (const chapter of chapters) {
		try {
			await Download.deleteChapterFile({
				title: manga.title,
				volume: chapter.volume,
			});
			logger.info({
				idManga: manga.idManga,
				idChapter: chapter.idChapter,
				volume: chapter.volume,
				status: 'kavita_cleanup_chapter_deleted',
			});
			deleted++;
		} catch (error) {
			logger.warn({
				idManga: manga.idManga,
				idChapter: chapter.idChapter,
				volume: chapter.volume,
				status: 'kavita_cleanup_chapter_delete_failed',
				error: error.message,
			});
		}
	}
	return deleted;
}

async function cleanupMangaChapters({ manga, token }) {
	const localChapters = await ChaptersRepository.listChaptersByManga({
		idManga: manga.idManga,
	});
	if (!localChapters.some((chapter) => chapter.downloadedAt)) {
		return { deleted: 0 };
	}

	const seriesList = await KavitaClient.searchSeries({ title: manga.title, token });
	const series = findMatchingSeries({ title: manga.title, seriesList });
	if (!series) {
		logger.info({ idManga: manga.idManga, status: 'kavita_series_not_found' });
		return { deleted: 0 };
	}

	const volumes = await KavitaClient.getSeriesVolumes({
		seriesId: series.seriesId,
		token,
	});
	const kavitaChapters = flattenKavitaChapters(volumes);
	const chaptersToDelete = selectChaptersToDelete({ localChapters, kavitaChapters });
	if (chaptersToDelete.length === 0) {
		return { deleted: 0 };
	}

	const deleted = await deleteChapters({ manga, chapters: chaptersToDelete });
	if (deleted > 0) {
		await KavitaClient.scanSeries({
			libraryId: series.libraryId,
			seriesId: series.seriesId,
			token,
		});
	}

	return { deleted };
}

async function listTargetMangas({ idManga }) {
	if (!idManga) return MangasRepository.listMangas({});
	const manga = await MangasRepository.findMangaById({ idManga });
	return manga ? [manga] : [];
}

async function cleanupReadChapters({ idManga } = {}) {
	const token = await ensureKavitaConnection();
	if (!token) {
		return { totalDeleted: 0, mangasProcessed: 0 };
	}

	const mangas = await listTargetMangas({ idManga });

	let totalDeleted = 0;
	for (const manga of mangas) {
		const { deleted } = await cleanupMangaChapters({ manga, token }).catch(
			(error) => {
				logger.error({
					idManga: manga.idManga,
					status: 'kavita_cleanup_manga_failed',
					error: error.message,
				});
				return { deleted: 0 };
			},
		);
		totalDeleted += deleted;
	}

	return { totalDeleted, mangasProcessed: mangas.length };
}

const KavitaCleanupService = { cleanupReadChapters };
export default KavitaCleanupService;

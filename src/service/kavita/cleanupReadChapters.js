import KavitaClient from '../../infra/kavitaClient.js';
import logger from '../../infra/logger.js';
import ChaptersRepository from '../../repository/chapters.js';
import MangasRepository from '../../repository/mangas.js';
import Download from '../download.js';
import {
	flattenKavitaChapters,
	selectChaptersToDelete,
} from './chapterEligibility.js';
import { findMatchingSeries } from './matchTitle.js';

async function ensureKavitaConnection() {
	const healthy = await KavitaClient.checkHealth();
	if (!healthy) {
		logger.warn({
			status: 'kavita_cleanup_aborted',
			reason: 'health_check_failed',
		});
		return null;
	}
	const token = await KavitaClient.authenticate();
	if (!token) {
		logger.warn({
			status: 'kavita_cleanup_aborted',
			reason: 'authenticate_failed',
		});
		return null;
	}
	return token;
}

function deleteStatus({ isOrphan, failed }) {
	if (isOrphan) {
		return failed
			? 'kavita_cleanup_orphan_chapter_delete_failed'
			: 'kavita_cleanup_orphan_chapter_deleted';
	}
	return failed
		? 'kavita_cleanup_chapter_delete_failed'
		: 'kavita_cleanup_chapter_deleted';
}

async function deleteChapters({ manga, chapters }) {
	let deleted = 0;
	for (const chapter of chapters) {
		const isOrphan = chapter.idChapter === null;
		try {
			await Download.deleteChapterFile({
				title: manga.title,
				volume: chapter.volume,
			});
			logger.info({
				idManga: manga.idManga,
				title: manga.title,
				idChapter: chapter.idChapter,
				volume: chapter.volume,
				status: deleteStatus({ isOrphan, failed: false }),
			});
			deleted++;
		} catch (error) {
			logger.warn({
				idManga: manga.idManga,
				title: manga.title,
				idChapter: chapter.idChapter,
				volume: chapter.volume,
				status: deleteStatus({ isOrphan, failed: true }),
				error: error.message,
			});
		}
	}
	return deleted;
}

async function cleanupMangaChapters({ manga, token }) {
	const localChapters = manga.idManga
		? await ChaptersRepository.listChaptersByManga({ idManga: manga.idManga })
		: [];

	const seriesList = await KavitaClient.searchSeries({
		title: manga.title,
		token,
	});
	const series = findMatchingSeries({ title: manga.title, seriesList });
	if (!series) {
		logger.info({
			idManga: manga.idManga,
			title: manga.title,
			status: 'kavita_series_not_found',
		});
		return { deleted: 0 };
	}

	const volumes = await KavitaClient.getSeriesVolumes({
		seriesId: series.seriesId,
		token,
	});
	const kavitaChapters = flattenKavitaChapters(volumes);
	const chaptersToDelete = selectChaptersToDelete({
		localChapters,
		kavitaChapters,
	});
	if (chaptersToDelete.length === 0) {
		logger.info({
			idManga: manga.idManga,
			title: manga.title,
			seriesId: series.seriesId,
			localChaptersCount: localChapters.length,
			kavitaChaptersCount: kavitaChapters.length,
			status: 'kavita_cleanup_no_eligible_chapters',
		});
		return { deleted: 0 };
	}

	const deleted = await deleteChapters({ manga, chapters: chaptersToDelete });
	if (deleted > 0) {
		try {
			await KavitaClient.scanSeries({
				libraryId: series.libraryId,
				seriesId: series.seriesId,
				token,
			});
		} catch (error) {
			logger.warn({
				idManga: manga.idManga,
				seriesId: series.seriesId,
				libraryId: series.libraryId,
				status: 'kavita_cleanup_scan_failed',
				error: error.message,
			});
		}
	}

	return { deleted };
}

async function listTargetMangas({ idManga, title }) {
	if (idManga) {
		const manga = await MangasRepository.findMangaById({ idManga });
		return manga ? [manga] : [];
	}
	if (title) return [{ idManga: null, title }];
	return MangasRepository.listMangas({});
}

async function cleanupReadChapters({ idManga, title } = {}) {
	const token = await ensureKavitaConnection();
	if (!token) {
		return { totalDeleted: 0, mangasProcessed: 0 };
	}

	const mangas = await listTargetMangas({ idManga, title });

	let totalDeleted = 0;
	for (const manga of mangas) {
		const { deleted } = await cleanupMangaChapters({ manga, token }).catch(
			(error) => {
				logger.error({
					idManga: manga.idManga,
					title: manga.title,
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

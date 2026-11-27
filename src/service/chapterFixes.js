import { NotFoundError } from '../infra/errors.js';
import BlockedChaptersRepository from '../repository/blockedChapters.js';
import ChaptersRepository from '../repository/chapters.js';
import scanMangaSeries from './kavita/scanMangaSeries.js';
import MangaAdminService from './mangaAdmin.js';

async function findOwnedChapter({ chapters, idManga, idChapter }) {
	const chapter = await chapters.findChapterById({ idChapter });
	if (chapter && chapter.idManga === idManga) return chapter;
	throw new NotFoundError({
		message: `Capítulo ${idChapter} não encontrado no mangá ${idManga}`,
		action: 'Informe um idChapter que pertença ao idManga da rota',
	});
}

/**
 * Admin corrections for chapters the source got wrong. Deps are injected so
 * the service avoids import cycles and stays testable; Task 5 adds more deps.
 * @example const fixes = createChapterFixes({ chapters, blocked, deleteChapter, scanSeries })
 * @param {{ chapters: object, blocked: object, deleteChapter: Function, scanSeries: Function }} deps
 */
export function createChapterFixes(deps) {
	const { chapters, blocked, deleteChapter, scanSeries } = deps;

	/**
	 * Blocks the chapter's (connector, plugin id) so discovery skips it, deletes
	 * the row and .cbz, then rescans Kavita (best-effort).
	 * @example await fixes.blockChapter({ idManga: 15, idChapter: 1248700, reason: 'cópia do 171' })
	 * @returns {Promise<{ idBlockedChapter: number }>}
	 */
	async function blockChapter({ idManga, idChapter, reason }) {
		const chapter = await findOwnedChapter({ chapters, idManga, idChapter });
		const { idMangaConnector, idChapterPlugin, volume } = chapter;
		const row = await blocked.insertBlocked({
			idMangaConnector,
			idChapterPlugin,
			volume,
			reason,
		});
		await deleteChapter({ idManga, idChapter });
		await scanSeries({ title: chapter.title });
		return { idBlockedChapter: row.idBlockedChapter };
	}

	/**
	 * @example await fixes.listBlocked({ idManga: 15 })
	 */
	function listBlocked({ idManga }) {
		return blocked.listBlockedByManga({ idManga });
	}

	/**
	 * @example await fixes.unblock({ idManga: 15, idBlockedChapter: 2 })
	 * @returns {Promise<void>}
	 */
	async function unblock({ idManga, idBlockedChapter }) {
		const count = await blocked.deleteBlocked({ idManga, idBlockedChapter });
		if (count > 0) return;
		throw new NotFoundError({
			message: `Bloqueio ${idBlockedChapter} não encontrado no mangá ${idManga}`,
			action: 'Liste os bloqueios do mangá e use um idBlockedChapter existente',
		});
	}

	return { ...deps, blockChapter, listBlocked, unblock };
}

const ChapterFixes = createChapterFixes({
	chapters: ChaptersRepository,
	blocked: BlockedChaptersRepository,
	deleteChapter: (params) => MangaAdminService.deleteChapter(params),
	scanSeries: scanMangaSeries,
});
export default ChapterFixes;

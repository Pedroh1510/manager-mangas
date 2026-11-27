import { rename, rm } from 'node:fs/promises';
import { NotFoundError } from '../infra/errors.js';
import BlockedChaptersRepository from '../repository/blockedChapters.js';
import ChaptersRepository from '../repository/chapters.js';
import ConnectorSwitchesRepository from '../repository/connectorSwitches.js';
import MangaConnectorsRepository from '../repository/mangaConnectors.js';
import PluginConfigRepository from '../repository/pluginConfig.js';
import {
	createChapterSourceReplace,
	findOwnedChapter,
} from './chapterSourceReplace.js';
import ConnectorSwitch from './connectorSwitch.js';
import Download from './download.js';
import scanMangaSeries from './kavita/scanMangaSeries.js';
import MangaService from './manga.js';
import MangaAdminService from './mangaAdmin.js';

/**
 * Admin corrections for chapters the source got wrong. Deps are injected so
 * the service avoids import cycles and stays testable. Source listing and
 * replacement live in chapterSourceReplace.js and are composed here.
 * @example const fixes = createChapterFixes({ chapters, blocked, deleteChapter, scanSeries, ...sourceDeps })
 * @param {{ chapters: object, blocked: object, deleteChapter: Function, scanSeries: Function }} deps
 *   plus the deps of createChapterSourceReplace
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

	const { listSources, replaceSource } = createChapterSourceReplace(deps);
	return { blockChapter, listBlocked, unblock, listSources, replaceSource };
}

const ChapterFixes = createChapterFixes({
	chapters: ChaptersRepository,
	blocked: BlockedChaptersRepository,
	deleteChapter: (params) => MangaAdminService.deleteChapter(params),
	scanSeries: scanMangaSeries,
	connectors: MangaConnectorsRepository,
	source: {
		listChaptersByManga: (params) => MangaService.listChaptersByManga(params),
		listPages: (params) => MangaService.listPages(params),
	},
	connectorSwitch: ConnectorSwitch,
	switches: ConnectorSwitchesRepository,
	pluginAccess: PluginConfigRepository,
	download: Download,
	chapterPath: (params) => Download.getPathMangaAndChapter(params).chapterPath,
	fs: { rename, rm },
});
export default ChapterFixes;

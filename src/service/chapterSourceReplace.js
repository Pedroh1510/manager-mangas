// "Baixar de fonte escolhida" (spec 2026-11-26 §4): list which active links
// have a chapter's volume, and replace the chapter with one of them. The new
// file is written beside the live one and swapped only after the download
// passed placeholderChapter and the row update succeeded, so any failure
// leaves the old file and row intact. Replaces of the same chapter are
// serialized by an in-process lock, and each one writes its own temp file.
import { dirname, join } from 'node:path';
import {
	BadGatewayError,
	BadRequestError,
	ConflictError,
	NotFoundError,
} from '../infra/errors.js';
import { toVolumeKey } from '../utils/chapterFormat.js';
import { blockKey } from './chapterGap.js';

const UNIQUE_VIOLATION = '23505';
const TEMP_SUFFIX = '.replacing';

/**
 * Chapter row by id, only when it belongs to the manga of the route.
 * @example await findOwnedChapter({ chapters, idManga: 15, idChapter: 1248700 })
 */
export async function findOwnedChapter({ chapters, idManga, idChapter }) {
	const chapter = await chapters.findChapterById({ idChapter });
	if (chapter && chapter.idManga === idManga) return chapter;
	throw new NotFoundError({
		message: `Capítulo ${idChapter} não encontrado no mangá ${idManga}`,
		action: 'Informe um idChapter que pertença ao idManga da rota',
	});
}

function sameVolume(left, right) {
	return toVolumeKey(left) === toVolumeKey(right);
}

/**
 * Source listing and replacement for one chapter row.
 * @example const { listSources, replaceSource } = createChapterSourceReplace(deps)
 * @param {{ chapters: object, blocked: object, connectors: object, source: object, connectorSwitch: object, switches: object, pluginAccess: object, download: object, chapterPath: Function, randomId: () => string, fs: { rename: Function, rm: Function }, scanSeries: Function }} deps
 * @returns {{ listSources: Function, replaceSource: Function }}
 */
export function createChapterSourceReplace(deps) {
	const { chapters, blocked, connectors, source } = deps;
	const replacingChapterIds = new Set();

	async function listActiveLinks({ idManga }) {
		const links = await connectors.listConnectorsByManga({ idManga });
		return links.filter((link) => link.isActive);
	}

	async function describeDisabled(link) {
		const found = await deps.switches.findSwitch({ idPlugin: link.idPlugin });
		return { status: 'disabled', reason: found?.disabledReason ?? null };
	}

	async function probeLink({ link, chapter, blockedKeys }) {
		if (!(await deps.connectorSwitch.isConnectorEnabled(link.idPlugin))) {
			return describeDisabled(link);
		}
		const listed = await source.listChaptersByManga({
			idPlugin: link.idPlugin,
			mangaId: link.idMangaPlugin,
		});
		const matches = listed.filter((item) =>
			sameVolume(item.volume, chapter.volume),
		);
		if (!matches.length) return { status: 'missing' };
		// A source can list a blocked copy and the real chapter under one volume.
		const open = matches.find((item) => !blockedKeys.has(blockKey(link, item)));
		const row = open ?? matches[0];
		const status = open ? 'available' : 'blocked';
		return { status, idChapterPlugin: String(row.id), title: row.title };
	}

	function toSource(link, chapter, settled) {
		const base = {
			idMangaConnector: link.idMangaConnector,
			idPlugin: link.idPlugin,
			titlePlugin: link.titlePlugin,
			isCurrent: link.idMangaConnector === chapter.idMangaConnector,
		};
		if (settled.status === 'fulfilled') return { ...base, ...settled.value };
		return { ...base, status: 'failed', reason: settled.reason?.message };
	}

	/**
	 * Asks every active link, in parallel, whether it lists the chapter's
	 * volume; one failing source never hides the others.
	 * @example await listSources({ idManga: 15, idChapter: 1248700 })
	 * // [{ idMangaConnector: 31, idPlugin: 'nexustoons', isCurrent: false, status: 'available', idChapterPlugin: '435999', title: 'Capítulo 177', titlePlugin: '...' }]
	 * @returns {Promise<object[]>}
	 */
	async function listSources({ idManga, idChapter }) {
		const chapter = await findOwnedChapter({ chapters, idManga, idChapter });
		const links = await listActiveLinks({ idManga });
		const blockedKeys = await blocked.listBlockedKeysByManga({ idManga });
		const settled = await Promise.allSettled(
			links.map((link) => probeLink({ link, chapter, blockedKeys })),
		);
		return links.map((link, index) => toSource(link, chapter, settled[index]));
	}

	async function findActiveLink({ idManga, idMangaConnector }) {
		const links = await listActiveLinks({ idManga });
		const link = links.find(
			(item) => item.idMangaConnector === idMangaConnector,
		);
		if (link) return link;
		throw new BadRequestError({
			message: `Link ${idMangaConnector} não é um link ativo do mangá ${idManga}`,
			action: `Use um destes idMangaConnector: [${links.map((item) => item.idMangaConnector).join(', ')}]`,
		});
	}

	async function assertNotBlocked({ idManga, link, idChapterPlugin }) {
		const blockedKeys = await blocked.listBlockedKeysByManga({ idManga });
		if (!blockedKeys.has(blockKey(link, { id: idChapterPlugin }))) return;
		throw new ConflictError({
			message: `Capítulo ${idChapterPlugin} do link ${link.idMangaConnector} está bloqueado`,
			action: 'Desbloqueie o par (link, capítulo) ou escolha outra fonte',
		});
	}

	async function findTargetChapter({ link, chapter, idChapterPlugin }) {
		const listed = await source.listChaptersByManga({
			idPlugin: link.idPlugin,
			mangaId: link.idMangaPlugin,
		});
		const row = listed.find(
			(item) => String(item.id) === String(idChapterPlugin),
		);
		const expected = toVolumeKey(chapter.volume);
		if (row && sameVolume(row.volume, chapter.volume)) return row;
		const received = row ? toVolumeKey(row.volume) : 'ausente na fonte';
		throw new BadRequestError({
			message: `Capítulo ${idChapterPlugin} de ${link.idPlugin}: volume esperado ${expected}, recebido ${received}`,
			action:
				'Liste as fontes do capítulo e use um idChapterPlugin com o mesmo volume',
		});
	}

	async function downloadToTemp({ link, chapter, idChapterPlugin, tempPath }) {
		const pages = await source.listPages({
			pluginId: link.idPlugin,
			chapterId: idChapterPlugin,
		});
		const access = await deps.pluginAccess.findPluginAccess({
			idPlugin: link.idPlugin,
		});
		await deps.download
			.downloadChapter({
				manga: chapter.title,
				chapter: chapter.volume,
				pages,
				cookie: access.cookie,
				userAgent: access.userAgent,
				targetPath: tempPath,
			})
			.catch((error) =>
				discardTemp(tempPath, toDownloadError(error, { chapter, link })),
			);
	}

	function toDownloadError(error, { chapter, link }) {
		if (error?.statusCode) return error;
		return new BadGatewayError({
			cause: error,
			message: `Download do capítulo ${chapter.idChapter} de ${link.idPlugin} falhou: ${error?.message}`,
			action: 'Escolha outra fonte',
		});
	}

	async function discardTemp(tempPath, error) {
		await deps.fs.rm(tempPath, { force: true });
		throw error;
	}

	function toUpdateError(error, { idMangaConnector, idChapterPlugin }) {
		if (error?.code !== UNIQUE_VIOLATION) return error;
		return new ConflictError({
			message: `Capítulo ${idChapterPlugin} do link ${idMangaConnector} já está salvo em outra linha`,
			action: 'Apague ou corrija a outra linha antes de trocar a fonte',
		});
	}

	async function swapRow({ chapter, target, tempPath, idMangaConnector }) {
		const values = { idMangaConnector, idChapterPlugin: String(target.id) };
		await chapters
			.updateChapterSource({
				idChapter: chapter.idChapter,
				...values,
				name: target.title,
			})
			.catch((error) => discardTemp(tempPath, toUpdateError(error, values)));
	}

	async function validateReplace({
		idManga,
		idChapter,
		idMangaConnector,
		idChapterPlugin,
	}) {
		const chapter = await findOwnedChapter({ chapters, idManga, idChapter });
		const link = await findActiveLink({ idManga, idMangaConnector });
		await deps.connectorSwitch.assertConnectorEnabled(link.idPlugin);
		await assertNotBlocked({ idManga, link, idChapterPlugin });
		const target = await findTargetChapter({ link, chapter, idChapterPlugin });
		return { chapter, link, target };
	}

	async function removeLegacyFile({ chapter, livePath }) {
		// Older downloads were named "<Number(volume)>.cbz" (see
		// Download.deleteChapterFile); drop it so Kavita does not keep the copy.
		const legacyPath = join(dirname(livePath), `${Number(chapter.volume)}.cbz`);
		if (legacyPath === livePath) return;
		await deps.fs.rm(legacyPath, { force: true });
	}

	async function runReplace(params) {
		const { chapter, link, target } = await validateReplace(params);
		const livePath = deps.chapterPath({
			title: chapter.title,
			volume: chapter.volume,
		});
		const tempPath = `${livePath}${TEMP_SUFFIX}-${deps.randomId()}`;
		const { idChapterPlugin, idMangaConnector } = params;
		await downloadToTemp({ link, chapter, idChapterPlugin, tempPath });
		await swapRow({ chapter, target, tempPath, idMangaConnector });
		await deps.fs.rename(tempPath, livePath);
		await removeLegacyFile({ chapter, livePath });
		await deps.scanSeries({ title: chapter.title });
		return { idChapter: chapter.idChapter };
	}

	function acquireReplaceLock(idChapter) {
		const key = Number(idChapter);
		if (!replacingChapterIds.has(key)) return replacingChapterIds.add(key);
		throw new ConflictError({
			message: `Troca do capítulo ${idChapter} já em andamento`,
			action: 'Aguarde a troca atual terminar e tente de novo',
		});
	}

	/**
	 * Replaces the chapter's file and row with the chosen link's chapter.
	 * Does not block the old (link, chapter) pair. A second replace of the
	 * same chapter while one runs fails with ConflictError (409).
	 * @example await replaceSource({ idManga: 15, idChapter: 1248700, idMangaConnector: 31, idChapterPlugin: '435999' }) // { idChapter: 1248700 }
	 * @returns {Promise<{ idChapter: number }>}
	 */
	async function replaceSource(params) {
		acquireReplaceLock(params.idChapter);
		try {
			return await runReplace(params);
		} finally {
			replacingChapterIds.delete(Number(params.idChapter));
		}
	}

	return { listSources, replaceSource };
}

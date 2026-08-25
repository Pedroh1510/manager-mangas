import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import sql from 'sql-bricks';
import database from '../infra/database.js';
import { BadRequestError, ValidationError } from '../infra/errors.js';
import ChaptersRepository from '../repository/chapters.js';
import MangaConnectorsRepository from '../repository/mangaConnectors.js';
import MangasRepository from '../repository/mangas.js';
import Download from './download.js';
import MangaService from './manga.js';
import { enqueueBackgroundTask } from './queue/backgroundQueue.js';
import { enqueueDownload } from './queue/downloadQueue.js';

async function createManga({ title }) {
	const existing = await MangasRepository.findMangaByTitleIncludingDeleted({
		title,
	});
	if (existing) {
		throw new BadRequestError({
			message: existing.deletedAt
				? 'This manga already exists in the database history'
				: 'This manga already exists in the database',
			action: existing.deletedAt
				? 'Try another title'
				: 'Try another title or idPlugin',
		});
	}
	const { idManga } = await MangasRepository.createManga({ title });
	return { idManga };
}

async function linkConnector({
	idManga,
	idPlugin,
	idMangaPlugin,
	titlePlugin,
}) {
	if (!MangaService.hasConnector(idPlugin)) {
		throw new ValidationError({
			message: `Plugin with id ${idPlugin} not found`,
			action: 'Change plugin id',
		});
	}
	const { idMangaConnector } = await MangaConnectorsRepository.linkConnector({
		idManga,
		idPlugin,
		idMangaPlugin,
		titlePlugin,
	}).catch((error) => {
		if (error.message.includes('duplicate key')) {
			throw new BadRequestError({
				cause: error,
				message: 'This manga is already linked to this connector',
				action: 'Try another idManga or idPlugin',
			});
		}
		throw error;
	});
	return { idMangaConnector, idManga, idPlugin };
}

async function setConnectorActive({ idManga, idPlugin, isActive }) {
	const updated = await MangaConnectorsRepository.setConnectorActive({
		idManga,
		idPlugin,
		isActive,
	});
	if (!updated) {
		throw new BadRequestError({
			message: `No connector link found for manga ${idManga} and plugin ${idPlugin}`,
			action: 'Check idManga and idPlugin',
		});
	}
	return updated;
}

async function listConnectors({ idManga }) {
	return MangaConnectorsRepository.listConnectorsByManga({ idManga });
}

async function listMangasRegistered({ title }) {
	return MangasRepository.listMangas({ title });
}

async function deleteManga({ idManga }) {
	const manga = await MangasRepository.findMangaById({ idManga });
	if (!manga || manga.deletedAt) {
		throw new BadRequestError({
			message: `Manga ${idManga} not found`,
			action: 'Check idManga',
		});
	}
	await ChaptersRepository.deleteChaptersByManga({ idManga });
	await MangaConnectorsRepository.deactivateAllForManga({ idManga });
	await MangasRepository.softDeleteManga({ idManga });
	const { mangaPath } = Download.getPathMangaAndChapter({ title: manga.title });
	await rm(mangaPath, { recursive: true, force: true });
}

async function registerCookie({ cookie, idPlugin, userAgent = null }) {
	if (!MangaService.hasConnector(idPlugin)) {
		throw new ValidationError({
			message: `Plugin with id ${idPlugin} not found`,
		});
	}
	const response = await database
		.query(
			sql
				.select('cookie')
				.from('pluginConfig')
				.where({ 'lower("idPlugin")': idPlugin.toLowerCase() })
				.toParams(),
		)
		.then(({ rows }) => rows);
	const data = {
		cookie,
		cookieUpdatedAt: new Date(),
	};

	if (userAgent) {
		data.userAgent = userAgent;
	}
	if (response.length) {
		await database.query(
			sql
				.update('pluginConfig', data)
				.where({ 'lower("idPlugin")': idPlugin.toLowerCase() })
				.toParams(),
		);
		return;
	}
	data.idPlugin = idPlugin;
	await database.query(sql.insertInto('pluginConfig', data).toParams());
}

async function registerCredentials({ idPlugin, login, password }) {
	if (!MangaService.hasConnector(idPlugin)) {
		throw new ValidationError({
			message: `Plugin with id ${idPlugin} not found`,
		});
	}

	const response = await database
		.query(
			sql
				.select('cookie')
				.from('pluginConfig')
				.where({ 'lower("idPlugin")': idPlugin.toLowerCase() })
				.toParams(),
		)
		.then(({ rows }) => rows);

	const data = {
		login,
		password,
	};
	if (response.length) {
		await database.query(
			sql
				.update('pluginConfig', data)
				.where({ 'lower("idPlugin")': idPlugin.toLowerCase() })
				.toParams(),
		);
		return;
	}
	data.idPlugin = idPlugin;
	await database.query(sql.insertInto('pluginConfig', data).toParams());
}

async function listChaptersMissing({ idManga }) {
	const connectors = (
		await MangaConnectorsRepository.listConnectorsByManga({ idManga })
	).filter((connector) => connector.isActive);
	if (!connectors.length) return [];

	const knownChapters = await ChaptersRepository.listChaptersByManga({
		idManga,
	});
	const knownVolumes = new Set(
		knownChapters.map((chapter) => `${chapter.volume}`),
	);

	const chaptersMissing = [];
	for (const connector of connectors) {
		const chapters = await MangaService.listChaptersByManga({
			idPlugin: connector.idPlugin,
			mangaId: connector.idMangaPlugin,
		});
		for (const chapter of chapters) {
			if (knownVolumes.has(`${chapter.volume}`)) continue;
			knownVolumes.add(`${chapter.volume}`);
			chaptersMissing.push({
				...chapter,
				idMangaConnector: connector.idMangaConnector,
			});
		}
	}
	return chaptersMissing;
}

async function updateMangaChapters({ idManga }) {
	const manga = await MangasRepository.findMangaById({ idManga });
	if (!manga || manga.deletedAt) return [];
	const pathFolder = path.resolve('downloads', manga.title);
	await mkdir(pathFolder, { recursive: true }).catch(() => {});

	const chaptersMissing = await listChaptersMissing({ idManga });
	for (const chapter of chaptersMissing) {
		await ChaptersRepository.insertChapter({
			idManga,
			idMangaConnector: chapter.idMangaConnector,
			idChapterPlugin: chapter.id,
			name: chapter.title,
			volume: chapter.volume,
		});
	}
	if (chaptersMissing.length) {
		await enqueueBackgroundTask(
			'downloadMangasBatch',
			{ idManga },
			`downloadMangasBatch-${idManga}`,
		);
	}
	return chaptersMissing;
}

async function updateMangas({ idPlugin }) {
	const connectors = await MangaConnectorsRepository.listActiveConnectors({
		idPlugin,
	});
	let counterMangasUpdated = 0;
	for (const connector of connectors) {
		await enqueueBackgroundTask(
			'updateMangaChapters',
			{ idManga: connector.idManga },
			`updateMangaChapters-${connector.idManga}`,
		);
		counterMangasUpdated++;
	}
	return { totalUpdated: counterMangasUpdated };
}

async function updateMangasBatch({ idPlugin }) {
	const connectors = await MangaConnectorsRepository.listActiveConnectors({
		idPlugin,
	});
	const totalUpdated = {};
	for (const connector of connectors) {
		totalUpdated[connector.idManga] = 0;
		const knownChapters = await ChaptersRepository.listChaptersByManga({
			idManga: connector.idManga,
		});
		const knownVolumes = new Set(
			knownChapters.map((chapter) => `${chapter.volume}`),
		);

		const chapters = await MangaService.listChaptersByManga({
			idPlugin: connector.idPlugin,
			mangaId: connector.idMangaPlugin,
		});
		const missing = chapters.filter(
			(chapter) => !knownVolumes.has(`${chapter.volume}`),
		);
		if (!missing.length) continue;

		const chaptersWithPages = await MangaService.listPagesBatch({
			pluginId: connector.idPlugin,
			chapters: missing.slice(0, 5),
			title: connector.title,
		});

		for (const chapter of chaptersWithPages) {
			const inserted = await ChaptersRepository.insertChapter({
				idManga: connector.idManga,
				idMangaConnector: connector.idMangaConnector,
				idChapterPlugin: chapter.id,
				name: chapter.title,
				volume: chapter.volume,
			});
			if (!inserted) continue;
			await enqueueDownload(
				{
					manga: connector.title,
					chapter: chapter.volume,
					pages: chapter.pages,
					idChapter: inserted.idChapter,
				},
				`downloadQueue-${connector.idManga}-${chapter.volume}`,
			);
			totalUpdated[connector.idManga]++;
		}
	}
	return totalUpdated;
}

async function listChapters({ idManga }) {
	return ChaptersRepository.listChaptersByManga({ idManga });
}

async function deleteChapter({ idManga, idChapter }) {
	const chapter = await ChaptersRepository.findChapterById({ idChapter });
	if (!chapter || chapter.idManga !== idManga) {
		throw new BadRequestError({
			message: `Chapter ${idChapter} not found for manga ${idManga}`,
			action: 'Check idManga and idChapter',
		});
	}
	await ChaptersRepository.deleteChapter({ idChapter });
	const { chapterPath } = Download.getPathMangaAndChapter({
		title: chapter.title,
		volume: chapter.volume,
	});
	await rm(chapterPath, { force: true });
}

async function listPagesAndSend({ idChapter }) {
	const chapter = await ChaptersRepository.findChapterById({ idChapter });
	if (!chapter) return;
	const pages = await MangaService.listPages({
		chapterId: chapter.idChapterPlugin,
		pluginId: chapter.idPlugin,
	});
	if (!pages.length) return;
	await enqueueDownload(
		{
			manga: chapter.title,
			chapter: chapter.volume,
			pages,
			idChapter,
		},
		`downloadQueue-${idChapter}`,
	);
}

async function downloadMangasBatch({ idManga } = {}) {
	const chaptersMissingDownload = await ChaptersRepository.listMissingDownloads(
		{ idManga },
	);
	if (!chaptersMissingDownload.length) return { totalDownloaded: 0 };
	let counterDownload = 0;
	for (const chapter of chaptersMissingDownload) {
		await enqueueBackgroundTask(
			'listPagesAndSend',
			{ idChapter: chapter.idChapter },
			`listPagesAndSend-${chapter.idChapter}`,
		);
		counterDownload++;
	}
	return { totalDownloaded: counterDownload };
}

async function downloadManga({ idManga, volume }) {
	const manga = await MangasRepository.findMangaById({ idManga });
	if (!manga) {
		throw new BadRequestError({
			message: `Manga ${idManga} not found`,
			action: 'Check idManga',
		});
	}
	return Download.downloadMangaFromDisk({ title: manga.title, volume });
}

const MangaAdminService = {
	createManga,
	linkConnector,
	setConnectorActive,
	listConnectors,
	listMangasRegistered,
	deleteManga,
	registerCookie,
	registerCredentials,
	listChaptersMissing,
	updateMangaChapters,
	updateMangas,
	updateMangasBatch,
	listChapters,
	deleteChapter,
	listPagesAndSend,
	downloadMangasBatch,
	downloadManga,
};

export default MangaAdminService;

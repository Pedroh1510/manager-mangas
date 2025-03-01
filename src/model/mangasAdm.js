import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import sql from 'sql-bricks';
import database from '../infra/database.js';
import { BadRequestError, ValidationError } from '../infra/errors.js';
import jobs from '../jobs.js';
import MangasService from './mangas.js';

async function listHistoryManga({ title }) {
	return database
		.query(sql.select('title').from('historyManga').where({ title }).toParams())
		.then(({ rows }) => rows.map(({ title }) => title));
}

async function registerManga({ title, idPlugin, titlePlugin }) {
	const id = Object.keys(MangasService.plugins).find(
		(item) => item.toLowerCase() === idPlugin?.toLowerCase()
	);
	if (id === undefined) {
		throw new ValidationError({
			message: `Plugin with id ${idPlugin} not found`,
			action: 'Change plugin id'
		});
	}
	const historyManga = await listHistoryManga({ title });
	if (historyManga.includes(title)) {
		throw new BadRequestError({
			message: 'This manga already exists in the database history',
			action: 'Try another title'
		});
	}
	let idManga = await database
		.query(
			sql
				.select('idManga')
				.from('mangas')
				.where({
					title
				})
				.toParams()
		)
		.then(({ rows }) => {
			return rows.length ? rows[0].idManga : null;
		});

	if (!idManga) {
		const response = await database.query({
			text: 'INSERT INTO "mangas" ("title") VALUES ($1) RETURNING "idManga"',
			values: [title]
		});
		idManga = response.rows[0].idManga;
	}

	await database
		.query(
			sql
				.insertInto('mangasPlugins', {
					idManga,
					idPlugin,
					titlePlugin: titlePlugin ?? title
				})
				.toParams()
		)
		.catch((error) => {
			if (error.message.includes('duplicate key')) {
				throw new BadRequestError({
					cause: error,
					message: 'This manga already exists in the database',
					action: 'Try another title or idPlugin'
				});
			}
			throw error;
		});

	return {
		idManga,
		idPlugin
	};
}

async function listMangasRegistered({ title }) {
	let where = {};
	if (title) {
		sql.like();
		where = sql.like(['lower("mangas".title)'], `%${title?.toLowerCase()}%`);
	}
	return database
		.query(
			sql
				.select(
					'idPlugin',
					'"mangasPlugins"."titlePlugin" as "title"',
					'"mangas".title as "titleFolder"',
					'"mangas"."idManga"'
				)
				.from('mangasPlugins')
				.join('mangas')
				.on({ '"mangas"."idManga"': '"mangasPlugins"."idManga"' })
				.where(where)
				.toParams()
		)
		.then(({ rows }) => rows)
		.then((rows) =>
			rows.map((row) => ({ ...row, title: row.title ?? row.titleFolder }))
		);
}

async function updateMangas() {
	const mangas = await database
		.query(
			sql
				.select('idPlugin', 'title', '"mangas"."idManga"')
				.from('mangasPlugins')
				.join('mangas')
				.on({ '"mangas"."idManga"': '"mangasPlugins"."idManga"' })
				.toParams()
		)
		.then(({ rows }) => rows);

	if (!mangas.length) return { totalUpdated: 0 };

	let counterMangasUpdated = 0;
	for (const { title } of mangas) {
		await jobs.queues.updateMangaQueue({ title });
		counterMangasUpdated++;
	}

	return {
		totalUpdated: counterMangasUpdated
	};
}

async function listPagesAndSend({
	idChapterPlugin,
	pluginId,
	title,
	volume,
	idChapter
}) {
	if (!idChapterPlugin || !pluginId || !title || !volume || !idChapter) return;
	const pages = await MangasService.listPages({
		chapterId: idChapterPlugin,
		pluginId: pluginId
	});
	if (!pages.length) return;
	await jobs.queues.downloadQueue({
		manga: title,
		chapter: volume,
		pages,
		idChapter: idChapter
	});
}

async function registerCookie({ cookie, idPlugin, userAgent = null }) {
	const id = Object.keys(MangasService.plugins).find(
		(item) => item.toLowerCase() === idPlugin.toLowerCase()
	);
	if (id === undefined) {
		throw new ValidationError({
			message: `Plugin with id ${idPlugin} not found`
		});
	}
	const response = await database
		.query(
			sql
				.select('cookie')
				.from('pluginConfig')
				.where({ 'lower("idPlugin")': id.toLowerCase() })
				.toParams()
		)
		.then(({ rows }) => rows);
	const data = {
		cookie,
		cookieUpdatedAt: new Date()
	};

	if (userAgent) {
		data.userAgent = userAgent;
	}
	if (response.length) {
		await database.query(
			sql
				.update('pluginConfig', data)
				.where({ 'lower("idPlugin")': id.toLowerCase() })
				.toParams()
		);
		return;
	}
	data.idPlugin = idPlugin;
	await database.query(sql.insertInto('pluginConfig', data).toParams());
}

async function registerCredentials({ idPlugin, login, password }) {
	const id = Object.keys(MangasService.plugins).find(
		(item) => item.toLowerCase() === idPlugin.toLowerCase()
	);
	if (id === undefined) {
		throw new ValidationError({
			message: `Plugin with id ${idPlugin} not found`
		});
	}

	const response = await database
		.query(
			sql
				.select('cookie')
				.from('pluginConfig')
				.where({ idPlugin: id })
				.toParams()
		)
		.then(({ rows }) => rows);

	const data = {
		login,
		password
	};
	if (response.length) {
		await database.query(
			sql.update('pluginConfig', data).where({ idPlugin }).toParams()
		);
		return;
	}
	data.idPlugin = idPlugin;
	await database.query(sql.insertInto('pluginConfig', data).toParams());
}

async function downloadMangasBatch(title) {
	const where = { wasDownloaded: false };
	if (title) {
		where.title = title;
	}
	const chaptersMissingDownload = await database
		.query(
			sql
				.select(
					'idChapter',
					'pluginId',
					'idChapterPlugin',
					'volume',
					'"mangas"."title"'
				)
				.from('chapters')
				.join('mangas')
				.on({ '"mangas"."idManga"': '"chapters"."idManga"' })
				.where(where)
				.orderBy('volume')
				.toParams()
		)
		.then(({ rows }) => rows);
	if (!chaptersMissingDownload.length) return { totalDownloaded: 0 };
	const chaptersBatch = chaptersMissingDownload;
	let counterDownload = 0;
	for (const chapter of chaptersBatch) {
		await jobs.queues.listPagesQueue(chapter);
		counterDownload++;
	}
	return { totalDownloaded: counterDownload };
}

async function listChaptersMissing({ mangaByPlugin }) {
	const chaptersInDatabase = await database
		.query(
			sql
				.select('name', 'pluginId', 'idChapterPlugin', 'volume')
				.from('chapters')
				.where({ idManga: mangaByPlugin[0].idManga })
				.toParams()
		)
		.then(({ rows }) => rows);
	const chaptersInDatabaseFormatted = {};
	for (const chapter of chaptersInDatabase) {
		chaptersInDatabaseFormatted[chapter.volume] = chapter;
	}
	const chaptersMissing = [];
	for (const { idPlugin, title } of mangaByPlugin) {
		const manga = await MangasService.getMangaFromPlugin({ idPlugin, title });
		if (!manga) continue;
		const chapters = await MangasService.listChaptersByManga({
			idPlugin,
			mangaId: manga.id
		});
		for (const chapter of chapters) {
			if (chaptersInDatabaseFormatted[chapter.volume]) continue;
			chaptersInDatabaseFormatted[chapter.volume] = chapter;
			chaptersMissing.push({ ...chapter, idPlugin });
		}
	}
	return chaptersMissing;
}

async function updateMangaChapters({ title }) {
	const mangaByPlugin = await listMangasRegistered({ title });
	const pathFolder = path.resolve('downloads', title);
	await mkdir(pathFolder, { recursive: true }).catch(() => {});
	if (!mangaByPlugin.length) return;
	const chaptersMissing = await listChaptersMissing({ title, mangaByPlugin });
	for (const chapter of chaptersMissing) {
		await database
			.query(
				sql
					.insertInto('chapters', {
						idChapterPlugin: chapter.id,
						name: chapter.title,
						volume: chapter.volume,
						pluginId: chapter.idPlugin,
						idManga: mangaByPlugin[0].idManga
					})
					.toParams()
			)
			.catch((error) => {
				if (!error.message.includes('duplicate key')) {
					throw error;
				}
			});
	}
	if (chaptersMissing.length) {
		await jobs.queues.downloadBatchQueue({ title });
	}
	return chaptersMissing;
}

async function deleteMangaChapters({ title, volume }) {
	const mangaByPlugin = await listMangasRegistered({ title });
	if (!mangaByPlugin.length) return;
	for (const manga of mangaByPlugin) {
		const hasChapter = await database
			.query(
				sql
					.select('1')
					.from('chapters')
					.where({ idManga: manga.idManga, volume })
					.toParams()
			)
			.then((response) => response.rows.length);
		if (!hasChapter) continue;
		await database.query(
			sql
				.delete()
				.from('chapters')
				.where({ idManga: manga.idManga, volume })
				.toParams()
		);
		const { chapterPath } = MangasService.getPathMangaAndChapter({
			title,
			volume
		});
		await rm(chapterPath);
	}
}

async function deleteManga({ title }) {
	const mangas = await listMangasRegistered({ title });
	for (const item of mangas) {
		const { mangaPath } = MangasService.getPathMangaAndChapter({
			title
		});
		await database.query(
			sql.deleteFrom('chapters').where({ idManga: item.idManga }).toParams()
		);
		await database.query(
			sql
				.deleteFrom('mangasPlugins')
				.where({ idManga: item.idManga })
				.toParams()
		);
		await database.query(
			sql.deleteFrom('mangas').where({ idManga: item.idManga }).toParams()
		);
		await rm(mangaPath, { recursive: true, force: true });
		await database.query(sql.insertInto('historyManga', { title }).toParams());
	}
}

const MangasAdmService = {
	registerManga,
	listMangasRegistered,
	updateMangas,
	listPagesAndSend,
	registerCookie,
	downloadMangasBatch,
	updateMangaChapters,
	registerCredentials,
	deleteMangaChapters,
	deleteManga,
	listChaptersMissing
};

export default MangasAdmService;

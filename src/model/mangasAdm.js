import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import database from '../infra/database.js';
import { BadRequestError, ValidationError } from '../infra/errors.js';
import jobs from '../jobs.js';
import MangasService from './mangas.js';

async function registerManga({ title, idPlugin }) {
	const id = Object.keys(MangasService.plugins).find(
		(item) => item.toLowerCase() === idPlugin?.toLowerCase()
	);
	if (id === undefined) {
		throw new ValidationError({
			message: `Plugin with id ${idPlugin} not found`,
			action: 'Change plugin id'
		});
	}

	let idManga = await database
		.query({
			text: 'SELECT "idManga" FROM "mangas" WHERE "title" = $1',
			values: [title]
		})
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
		.query({
			text: 'INSERT INTO "mangasPlugins" ("idManga", "idPlugin") VALUES ($1, $2)',
			values: [idManga, idPlugin]
		})
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
	if (title) {
		return database
			.query({
				text: 'SELECT "idPlugin", "title","mangas"."idManga" FROM "mangasPlugins" INNER JOIN "mangas" ON ("mangas"."idManga" = "mangasPlugins"."idManga") WHERE lower("title") ~~ $1',
				values: [title.toLowerCase()]
			})
			.then(({ rows }) => rows);
	}
	return database
		.query(
			'SELECT "idPlugin", "title","mangas"."idManga" FROM "mangasPlugins" INNER JOIN "mangas" ON ("mangas"."idManga" = "mangasPlugins"."idManga")'
		)
		.then(({ rows }) => rows);
}

async function updateMangas() {
	const mangas = await database
		.query(
			'SELECT "idPlugin", "title","mangas"."idManga" FROM "mangasPlugins" INNER JOIN "mangas" ON ("mangas"."idManga" = "mangasPlugins"."idManga")'
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
		.query({
			text: `SELECT
		cookie
	FROM "pluginConfig" WHERE "idPlugin" = $1;`,
			values: [id]
		})
		.then(({ rows }) => rows);

	if (response.length) {
		await database.query({
			text: `UPDATE "pluginConfig" SET
			cookie = $1
			, "cookieUpdatedAt" = $2
			, "userAgent" = $3
			WHERE "idPlugin" = $4`,
			values: [cookie, new Date(), userAgent, id]
		});
		return;
	}
	await database.query({
		text: `INSERT INTO
			"pluginConfig"(cookie, "cookieUpdatedAt","idPlugin","userAgent")
		VALUES ($1, $2, $3,$4)`,
		values: [cookie, new Date(), id, userAgent]
	});
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
		.query({
			text: `SELECT
		cookie
	FROM "pluginConfig" WHERE "idPlugin" = $1;`,
			values: [id]
		})
		.then(({ rows }) => rows);

	if (response.length) {
		await database.query({
			text: `UPDATE "pluginConfig" SET
			login = $1
			, "password" = $2
			WHERE "idPlugin" = $3`,
			values: [login, password, id]
		});
		return;
	}
	await database.query({
		text: `INSERT INTO
			"pluginConfig"(login, "password","idPlugin")
		VALUES ($1, $2, $3)`,
		values: [login, password, id]
	});
}

async function downloadMangasBatch() {
	const chaptersMissingDownload = await database
		.query(
			`SELECT "idChapter","pluginId","idChapterPlugin", "volume","mangas"."title" FROM "chapters"
JOIN "mangas" ON "mangas"."idManga"= "chapters"."idManga" where "wasDownloaded" = false
	ORDER BY "volume"`
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

async function listChaptersMissing({ title, mangaByPlugin }) {
	const chaptersInDatabase = await database
		.query({
			text: 'SELECT "name","pluginId","idChapterPlugin", "volume" FROM "chapters" where "idManga" = $1;',
			values: [mangaByPlugin[0].idManga]
		})
		.then(({ rows }) => rows);
	const chaptersInDatabaseFormatted = {};
	for (const chapter of chaptersInDatabase) {
		chaptersInDatabaseFormatted[chapter.volume] = chapter;
	}
	const chaptersMissing = [];
	for (const { idPlugin } of mangaByPlugin) {
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
			.query({
				text: 'INSERT INTO "chapters" ("idChapterPlugin", "name", "volume", "pluginId","idManga") VALUES ($1,$2,$3,$4,$5);',
				values: [
					chapter.id,
					chapter.title,
					chapter.volume,
					chapter.idPlugin,
					mangaByPlugin[0].idManga
				]
			})
			.catch((error) => {
				if (!error.message.includes('duplicate key')) {
					throw error;
				}
			});
	}
	if (chaptersMissing.length) {
		await jobs.queues.downloadBatchQueue();
	}
	return chaptersMissing;
}

const MangasAdmService = {
	registerManga,
	listMangasRegistered,
	updateMangas,
	listPagesAndSend,
	registerCookie,
	downloadMangasBatch,
	updateMangaChapters,
	registerCredentials
};

export default MangasAdmService;

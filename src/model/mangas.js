import path from 'node:path';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { mkdir, rm } from 'node:fs/promises';
import { downloadImage } from '../utils/download.js';
import { BadRequestError, ValidationError } from '../infra/errors.js';
import database from '../infra/database.js';
import jobs from '../jobs.js';

const plugins = {};
async function initMangas() {
	const PATH = path.resolve('src', 'infra', 'engines');
	const PLUGIN_PATH = path.join(PATH, 'connectors');

	const dom = new JSDOM('<!DOCTYPE html>');
	const { document } = dom.window;
	globalThis.document = document;
	const EngineRequest = (await import(`${PATH}/engine/Request.mjs`)).default;
	const Blacklist = (await import(`${PATH}/engine/Blacklist.mjs`)).default;
	const Settings = (await import(`${PATH}/engine/Settings.mjs`)).default;
	const Storage = (await import(`${PATH}/engine/Storage.mjs`)).default;
	const er = new EngineRequest();
	await er.setup();
	globalThis.Engine = {
		Request: er,
		Blacklist: new Blacklist(),
		Settings: new Settings(),
		Storage: new Storage()
	};
	function recFindByExt(base, ext, files, result) {
		files = files || fs.readdirSync(base);
		result = result || [];

		files.forEach((file) => {
			const newbase = path.join(base, file);
			if (fs.statSync(newbase).isDirectory()) {
				result = recFindByExt(newbase, ext, fs.readdirSync(newbase), result);
			} else {
				if (file.substr(-1 * (ext.length + 1)) === '.' + ext) {
					if (result) {
						result.push(newbase);
					}
				}
			}
		});
		return result;
	}
	function searchPluginsInFolder(folder) {
		return recFindByExt(folder, 'mjs');
	}

	async function loadPlugin(pluginPath) {
		return import(pluginPath);
	}
	const loadedPlugins = [];
	searchPluginsInFolder(PLUGIN_PATH).forEach((filePath) => {
		loadedPlugins.push(
			loadPlugin(filePath)
				.then((module) => {
					return {
						module,
						name: path.basename(filePath, path.extname(filePath))
					};
				})
				.catch((e) => {
					1;
				})
		);
	});

	await Promise.allSettled(loadedPlugins).then((item) => {
		if (item.length) {
			item.forEach((aaa) => {
				try {
					if (aaa.status === 'fulfilled') {
						const { module, name } = aaa.value;
						plugins[name] = {
							module: module.default,
							name
						};
					}
				} catch (err) {
					2;
					throw err;
				}
			});
		}
		1;
	});
}
import AdmZip from 'adm-zip';
import logger from '../infra/logger.js';

async function downloadMangas({ manga, chapter, pages, idChapter }) {
	let counter = 1;
	if (idChapter) {
		const response = await database
			.query({
				text: `SELECT 1 FROM chapters where "idChapter" = $1 and "wasDownloaded" = false`,
				values: [idChapter]
			})
			.then(({ rows }) => rows);
		if (!response.length) return;
	}
	const pathFolder = path.resolve('downloads', manga);
	await mkdir(pathFolder, { recursive: true });
	const pathFile = path.join(pathFolder, `${chapter}.cbz`);
	await rm(pathFile, {
		recursive: true
	}).catch(() => {});
	logger.info({ manga, chapter, status: 'inicio' });
	const zip = new AdmZip();
	const imagesType = ['png', 'jpeg', 'jpg', 'avif'];
	for (const page of pages) {
		const image = await downloadImage({ url: page });
		if (page.endsWith('.zip')) {
			const imageZip = new AdmZip(image);
			const zipEntries = imageZip.getEntries();
			for (const entry of zipEntries) {
				if (imagesType.some((item) => entry.name.endsWith(item))) {
					const name = entry.name.split('.');
					name.pop();
					const { imageFormatted, type } = await processImage(entry.getData());
					zip.addFile(`${name.join('.')}.${type}`, imageFormatted);
				}
			}
		} else {
			const { imageFormatted, type } = await processImage(image);
			zip.addFile(`${counter}.${type}`, imageFormatted);
		}
		counter++;
	}

	await zip.writeZipPromise(pathFile);

	if (idChapter) {
		await database.query({
			text: `UPDATE "chapters" SET
			"wasDownloaded" = true
			WHERE
			"idChapter" = $1`,
			values: [idChapter]
		});
	}
	logger.info({ manga, chapter, status: 'fim' });
}
import sharp from 'sharp';
async function processImage(image) {
	const options = ['webp', 'png'];
	for (const imageFormat of options) {
		try {
			const result = await sharp(image)
				.toFormat(imageFormat)
				.webp({
					quality: 80
				})
				.toBuffer();
			return { imageFormatted: result, type: imageFormat };
		} catch (error) {}
	}
	return { imageFormatted: image, type: 'png' };
}

async function getInstancePlugin(pluginId) {
	const id = Object.keys(plugins).find(
		(item) => item.toLowerCase() === pluginId.toLowerCase()
	);
	if (id === undefined) {
		throw new Error(`Plugin with id ${pluginId} not found`);
	}
	const { module } = plugins[id];
	const instance = new module();
	const response = await database
		.query({
			text: `SELECT
		cookie
	FROM "pluginConfig" WHERE "idPlugin" = $1;`,
			values: [id]
		})
		.then(({ rows }) => rows);
	if (response.length) {
		const date = new Date();
		date.setHours(date.getHours() - 6);
		const responseValid = await database
			.query({
				text: `SELECT
				cookie
			FROM "pluginConfig" WHERE "idPlugin" = $1
			AND "cookieUpdatedAt" > to_timestamp($2, 'M/DD/YYYY HH:MI:SS');`,
				values: [id, date.toLocaleString()]
			})
			// 		.query({
			// 			text: `SELECT
			// 	cookie
			// FROM "pluginConfig" WHERE "idPlugin" = $1
			// AND "cookieUpdatedAt" > to_timestamp($2, 'DD/MM/YYYY, HH24:MI:SS');`,
			// 			values: [id, date.toLocaleString()]
			// 		})
			.then(({ rows }) => rows);
		if (!responseValid.length)
			throw new Error(`Plugin with id ${pluginId} cookie expired`);
		instance.cookie = response[0].cookie;
	}
	return instance;
}
async function listMangas({ pluginId, title }) {
	const instance = await getInstancePlugin(pluginId);
	let mangas = await instance.getMangas();
	if (mangas.length === 0) {
		mangas = await instance.updateMangas();
	}

	const data = mangas.map((manga) => ({ id: manga.id, title: manga.title }));
	if (title) {
		return data.filter(
			(item) =>
				item.title.toLowerCase() === title.toLowerCase() ||
				item.title.toLowerCase().includes(title.toLowerCase())
		);
	}
	return data;
}

/**
 *
 * @param {Object} param
 * @param {String} param.pluginId,
 * @param {String} param.mangaId,
 * @returns {Promise<{id:String, title:String}[]>}
 */
async function listChapters({ pluginId, mangaId }) {
	const instance = await getInstancePlugin(pluginId);
	return instance._getChapters({ id: mangaId });
}

async function listPages({ pluginId, chapterId }) {
	const instance = await getInstancePlugin(pluginId);
	return instance._getPages({ id: chapterId });
}

async function registerManga({ title, idPlugin }) {
	const id = Object.keys(plugins).find(
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
	return database
		.query({
			text: 'SELECT "idPlugin", "title","mangas"."idManga" FROM "mangasPlugins" INNER JOIN "mangas" ON ("mangas"."idManga" = "mangasPlugins"."idManga") WHERE "title" ~~ $1',
			values: [title]
		})
		.then(({ rows }) => rows);
}

/**
 *
 * @param {Object} params
 * @param {String} params.idPlugin
 * @param {String} params.title
 * @returns {Promise<{id:String}>}
 */
async function getMangaFromPlugin({ idPlugin, title }) {
	const mangas = await listMangas({ pluginId: idPlugin });
	return mangas.find((manga) => manga.title === title);
}

/**
 * @typedef {Object} Chapter
 * @prop {String} id
 * @prop {String} title
 * @prop {String} volume
 * @prop {String} language
 *
 * @returns {Promise<Chapter[]>}
 */
async function listChaptersByManga({ idPlugin, mangaId }) {
	const chapters = await listChapters({
		mangaId,
		pluginId: idPlugin
	});
	return chapters
		.map((chapter) => {
			const a = chapter.title;
			const q = a.match(/([0-9]*[.])?[0-9]+/);
			chapter.volume = q.length ? parseInt(q[0]) : null;
			if (chapter.volume === null || isNaN(chapter.volume)) {
				logger.info(1);
			}
			return chapter;
		})
		.filter(
			(chapter) =>
				chapter.volume !== undefined ||
				chapter.volume !== null ||
				chapter.volume === ''
		)
		.filter((chapter) => ['pt', 'pt-br'].includes(chapter.language));
}

async function listChaptersMissing({ title, mangaByPlugin }) {
	const chaptersInDatabase = await database
		.query({
			text: 'SELECT "name","pluginId","idChapterPlugin", "volume" FROM "chapters" where "idManga" = $1;',
			values: [mangaByPlugin[0].idManga]
		})
		.then(({ rows }) => rows);
	const chaptersInDatabaseFormatted = {};
	chaptersInDatabase.forEach((chapter) => {
		chaptersInDatabaseFormatted[chapter.volume] = chapter;
	});
	const chaptersMissing = [];
	for (const { idPlugin } of mangaByPlugin) {
		const manga = await getMangaFromPlugin({ idPlugin, title });
		if (!manga) continue;
		const chapters = await listChaptersByManga({ idPlugin, mangaId: manga.id });
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
	const pages = await listPages({
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

async function registerCookie({ cookie, idPlugin }) {
	const id = Object.keys(plugins).find(
		(item) => item.toLowerCase() === idPlugin.toLowerCase()
	);
	if (id === undefined) {
		throw new Error(`Plugin with id ${idPlugin} not found`);
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
			WHERE "idPlugin" = $3`,
			values: [cookie, new Date(), id]
		});
		return;
	}
	await database.query({
		text: `INSERT INTO
			"pluginConfig"(cookie, "cookieUpdatedAt","idPlugin")
		VALUES ($1, $2, $3)`,
		values: [cookie, new Date(), id]
	});
}

const MangasService = {
	initMangas,
	downloadMangas,
	listMangas,
	listChapters,
	listPages,
	listPagesAndSend,
	registerManga,
	listMangasRegistered,
	updateMangaChapters,
	downloadMangasBatch,
	updateMangas,
	registerCookie
};

export default MangasService;

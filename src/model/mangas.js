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

async function downloadMangas({ manga, chapter, pages }) {
	let counter = 1;
	const pathFolder = path.resolve('downloads', manga, `${chapter}`);
	await rm(pathFolder, {
		recursive: true
	}).catch(() => {});
	await mkdir(pathFolder, { recursive: true });
	const promises = [];
	for (const page of pages) {
		const pathFile = path.join(pathFolder, `${counter}.png`);
		promises.push(downloadImage({ path: pathFile, url: page }));
		if (promises.length >= 5) {
			await Promise.allSettled(promises);
			promises.length = 0;
		}
		counter++;
	}
	await Promise.allSettled(promises).catch((error) => {
		throw error;
	});
}

async function listMangas({ pluginId }) {
	const id = Object.keys(plugins).find(
		(item) => item.toLowerCase() === pluginId.toLowerCase()
	);
	if (id === undefined) {
		throw new Error(`Plugin with id ${pluginId} not found`);
	}
	const { module } = plugins[id];
	const instance = new module();
	let mangas = await instance.getMangas();
	if (mangas.length === 0) {
		mangas = await instance.updateMangas();
	}

	return mangas.map((manga) => ({ id: manga.id, title: manga.title }));
}

/**
 *
 * @param {Object} param
 * @param {String} param.pluginId,
 * @param {String} param.mangaId,
 * @returns {Promise<{id:String, title:String}[]>}
 */
async function listChapters({ pluginId, mangaId }) {
	const id = Object.keys(plugins).find(
		(item) => item.toLowerCase() === pluginId.toLowerCase()
	);
	if (id === undefined) {
		throw new Error(`Plugin with id ${pluginId} not found`);
	}
	const { module } = plugins[id];
	const instance = new module();
	return instance._getChapters({ id: mangaId });
}

async function listPages({ pluginId, chapterId }) {
	const id = Object.keys(plugins).find(
		(item) => item.toLowerCase() === pluginId.toLowerCase()
	);
	if (id === undefined) {
		throw new Error(`Plugin with id ${pluginId} not found`);
	}
	const { module } = plugins[id];
	const instance = new module();
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
				console.log(1);
			}
			return chapter;
		})
		.filter(
			(chapter) =>
				chapter.volume !== undefined ||
				chapter.volume !== null ||
				chapter.volume === ''
		);
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
		const chapters = await updateMangaChapters({ title });
		if (!chapters.length) continue;
		counterMangasUpdated++;
	}
	await jobs.queues.downloadBatchQueue();
	return {
		totalUpdated: counterMangasUpdated
	};
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
	const batch = 2;
	const chaptersBatch = chaptersMissingDownload.slice(0, batch);
	let counterDownload = 0;
	for (const chapter of chaptersBatch) {
		const pages = await listPages({
			chapterId: chapter.idChapterPlugin,
			pluginId: chapter.pluginId
		});
		if (!pages.length) continue;
		await downloadMangas({
			manga: chapter.title,
			chapter: chapter.volume,
			pages
		});
		await database.query({
			text: `UPDATE "chapters" SET
			"wasDownloaded" = true
		WHERE
			"idChapter" = $1`,
			values: [chapter.idChapter]
		});
		counterDownload++;
	}
	return { totalDownloaded: counterDownload };
}

const MangasService = {
	initMangas,
	downloadMangas,
	listMangas,
	listChapters,
	listPages,
	registerManga,
	listMangasRegistered,
	updateMangaChapters,
	downloadMangasBatch,
	updateMangas
};

export default MangasService;

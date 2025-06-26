import fs from 'node:fs';
import path from 'node:path';
import sql from 'sql-bricks';
import { JSDOM } from 'jsdom';
import database from '../infra/database.js';

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
		const filesNew = files || fs.readdirSync(base);
		let resultArray = result || [];

		for (const file of filesNew) {
			const newbase = path.join(base, file);
			if (fs.statSync(newbase).isDirectory()) {
				resultArray = recFindByExt(
					newbase,
					ext,
					fs.readdirSync(newbase),
					resultArray
				);
			} else {
				if (file.substr(-1 * (ext.length + 1)) === `.${ext}`) {
					if (resultArray) {
						resultArray.push(newbase);
					}
				}
			}
		}
		return resultArray;
	}
	function searchPluginsInFolder(folder) {
		return recFindByExt(folder, 'mjs');
	}

	async function loadPlugin(pluginPath) {
		return import(pluginPath);
	}
	const loadedPlugins = [];
	for (const filePath of searchPluginsInFolder(PLUGIN_PATH)) {
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
	}

	await Promise.allSettled(loadedPlugins).then((item) => {
		if (item.length) {
			for (const aaa of item) {
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
			}
		}
		1;
	});
}
import logger from '../infra/logger.js';
import Download from './download.js';

async function downloadMangas({ manga, chapter, pages, idChapter }) {
	let cookie = null;
	let userAgent = null;
	if (idChapter) {
		const response = await database
			.query(
				sql
					.select('cookie', 'userAgent')
					.from('chapters')
					.join('pluginConfig')
					.on({
						'lower("pluginConfig"."idPlugin")': 'lower(chapters."pluginId")'
					})
					.where({ idChapter, wasDownloaded: false })
					.toParams()
			)
			.then(({ rows }) => rows);
		if (response.length) {
			cookie = response[0]?.cookie;
			userAgent = response[0]?.userAgent;
		}
	}
	logger.info({ manga, chapter, status: 'inicio' });
	await Download.downloadChapter({
		chapter,
		pages,
		cookie,
		userAgent,
		manga
	});

	if (idChapter) {
		await database.query(
			sql
				.update('chapters', { wasDownloaded: true })
				.where({ idChapter })
				.toParams()
		);
	}
	logger.info({ manga, chapter, status: 'fim' });
}

async function listPlugins({ name }) {
	const data = Object.keys(plugins).map((id) => {
		const { module } = plugins[id];
		try {
			const instance = new module();
			return {
				url: instance.url,
				id: instance.id
			};
		} catch {
			return null;
		}
	});
	if (name) {
		return data
			.filter((item) => item !== null)
			.filter((item) => item.id?.toLowerCase().includes(name?.toLowerCase()));
	}
	return data;
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
		.query(
			sql
				.select('cookie', 'login', 'password', 'userAgent')
				.from('pluginConfig')
				.where({ 'lower("idPlugin")': id.toLowerCase() })
				.toParams()
		)
		.then(({ rows }) => rows);
	if (response.length && response[0].cookie) {
		const date = new Date();
		date.setHours(date.getHours() - 18);
		const responseValid = await database
			.query({
				text: `SELECT
				cookie
			FROM "pluginConfig" WHERE lower("idPlugin") = $1
			AND "cookieUpdatedAt" > to_timestamp($2, 'M/DD/YYYY HH:MI:SS');`,
				values: [id.toLowerCase(), date.toLocaleString()]
			})
			// .query({
			// 	text: `SELECT
			// 	cookie
			// FROM "pluginConfig" WHERE "idPlugin" = $1
			// AND "cookieUpdatedAt" > to_timestamp($2, 'DD/MM/YYYY, HH24:MI:SS');`,
			// 	values: [id, date.toLocaleString()]
			// })
			.then(({ rows }) => rows);
		if (!responseValid.length)
			throw new Error(`Plugin with id ${pluginId} cookie expired`);
		instance.cookie = response[0].cookie;
	}
	if (response.length) {
		if (response[0].login) {
			instance.login = response[0].login;
			instance.password = response[0].password;
		}
		if (response[0].userAgent) {
			instance.userAgent = response[0].userAgent;
		}
	}
	return instance;
}
async function listMangas({ pluginId, title }) {
	const instance = await getInstancePlugin(pluginId);
	let mangas = await instance.getMangas();
	let isOld = false;
	if (mangas.length > 0) {
		const pathToCache = `${Engine.Storage.config}mangas.${instance.id}`;
		const qq = fs.statSync(path.resolve('src', '..', pathToCache));
		const now = new Date();
		now.setDate(now.getDate() - 7);
		isOld = now >= qq.mtime;
	}
	if (mangas.length === 0 || isOld) {
		mangas = await instance.updateMangas();
	}

	const data = mangas.map((manga) => ({ id: manga.id, title: manga.title }));
	if (title) {
		return data.filter(
			(item) =>
				item.title.toLowerCase() === title.toLowerCase() ||
				item.title.toLowerCase().includes(title.toLowerCase().trim())
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

/**
 *
 * @param {Object} params
 * @param {String} params.idPlugin
 * @param {String} params.title
 * @returns {Promise<{id:String}>}
 */
async function getMangaFromPlugin({ idPlugin, title }) {
	const response = await listMangas({ pluginId: idPlugin, title });

	return response?.length !== 0 ? response[0] : {};
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
	if (!idPlugin || !mangaId) return [];
	const chapters = await listChapters({
		mangaId,
		pluginId: idPlugin
	});
	const chaptersFiltered = chapters
		.filter((chapter) => ['pt', 'pt-br'].includes(chapter.language))
		.map((chapter) => {
			const a = chapter.title;
			const q = a.match(/([0-9]*[.])?[0-9]+/);
			chapter.volume = q?.length ? Number.parseInt(q[0]) : null;
			if (chapter.volume === null || Number.isNaN(chapter.volume)) {
				chapter.volume = null;
			}
			if (
				chapter.volume === null &&
				chapter.title.includes('Vol.') &&
				chapter.title.includes('Ch.')
			) {
				const titleOnlyVolCh = chapter.title.replace(/(?:(?![\d|\.]).)/g, '');
				const titleArray = titleOnlyVolCh
					.split('.')
					.filter((item) => item.trim());
				let volume = titleArray.join('');
				if (titleArray.length > 2) {
					volume = titleArray.slice(0, 2).join('');
					volume += `.${titleArray.slice(2).join()}`;
				}
				chapter.volume = Number.parseFloat(volume);
			}
			if (chapter.volume === null || Number.isNaN(chapter.volume)) {
				chapter.volume = null;
			}
			return chapter;
		})
		.filter(
			(chapter) =>
				!(
					chapter.volume === undefined ||
					chapter.volume === null ||
					chapter.volume === ''
				)
		);
	const chaptersNotVolumeDuplicated = {};
	for (const chapter of chaptersFiltered) {
		if (`${chapter.volume}` in chaptersNotVolumeDuplicated) continue;
		chaptersNotVolumeDuplicated[chapter.volume] = chapter;
	}
	return Object.values(chaptersNotVolumeDuplicated);
}

const MangasService = {
	initMangas,
	downloadMangas,
	listMangas,
	listChapters,
	listPages,
	listChaptersByManga,
	getMangaFromPlugin,
	listPlugins,
	plugins
};

export default MangasService;

import sql from 'sql-bricks';
import * as registry from '../connectors/registry.js';
import database from '../infra/database.js';
import logger from '../infra/logger.js';
import { formatChapters } from '../utils/chapterFormat.js';
import * as mangaCatalog from '../utils/mangaCatalog.js';
import Download from './download.js';
import { enqueueAndWait } from './queue/connectorQueue.js';

async function downloadMangas({ manga, chapter, pages, idChapter }) {
	let cookie = null;
	let userAgent = null;
	if (idChapter) {
		const response = await database
			.query(
				sql
					.select('cookie', 'userAgent')
					.from('chapters')
					.join('mangaConnectors')
					.on({
						'"mangaConnectors"."idMangaConnector"':
							'chapters."idMangaConnector"',
					})
					.join('pluginConfig')
					.on({
						'lower("pluginConfig"."idPlugin")':
							'lower("mangaConnectors"."idPlugin")',
					})
					.where({
						'"chapters"."idChapter"': idChapter,
						'"chapters"."downloadedAt"': null,
					})
					.toParams(),
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
		manga,
	});

	if (idChapter) {
		await database.query(
			sql
				.update('chapters', { downloadedAt: new Date() })
				.where({ idChapter })
				.toParams(),
		);
	}
	logger.info({ manga, chapter, status: 'fim' });
}

async function listPlugins({ name }) {
	const data = registry.listConnectorIds().map((id) => {
		const ConnectorClass = registry.getConnectorClass(id);
		const instance = new ConnectorClass();
		return {
			url: instance.url,
			id: instance.id,
		};
	});
	if (name) {
		return data.filter((item) =>
			item.id?.toLowerCase().includes(name?.toLowerCase()),
		);
	}
	return data;
}

async function getInstancePlugin(pluginId) {
	if (!registry.hasConnector(pluginId)) {
		throw new Error(`Plugin with id ${pluginId} not found`);
	}
	const ConnectorClass = registry.getConnectorClass(pluginId);
	const instance = new ConnectorClass();
	const id = instance.id;

	const response = await database
		.query(
			sql
				.select('cookie', 'login', 'password', 'userAgent')
				.from('pluginConfig')
				.where({ 'lower("idPlugin")': id.toLowerCase() })
				.toParams(),
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
				values: [id.toLowerCase(), date.toLocaleString()],
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
async function refreshCatalog(instance) {
	const mangas = await enqueueAndWait(instance.id, 'listMangas', {});
	await mangaCatalog.saveCatalog(instance.id, mangas);
	return mangas;
}

async function getCatalog(instance) {
	if (await mangaCatalog.isStale(instance.id)) {
		return refreshCatalog(instance);
	}
	const cached = await mangaCatalog.loadCatalog(instance.id);
	return cached ?? refreshCatalog(instance);
}

async function listMangas({ pluginId, title }) {
	const instance = await getInstancePlugin(pluginId);
	const mangas = await getCatalog(instance);

	const data = mangas.map((manga) => ({ id: manga.id, title: manga.title }));
	if (title) {
		return data.filter(
			(item) =>
				item.title.toLowerCase() === title.toLowerCase() ||
				item.title.toLowerCase().includes(title.toLowerCase().trim()),
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
	return enqueueAndWait(instance.id, 'listChapters', {
		manga: { id: mangaId },
	});
}

async function listPages({ pluginId, chapterId }) {
	const instance = await getInstancePlugin(pluginId);
	return enqueueAndWait(instance.id, 'listPages', {
		chapter: { id: chapterId },
	});
}

/**
 *
 * @param {Object} param
 * @param {String} param.pluginId
 * @param {String} param.title
 * @param {{id:String}[]} param.chapters
 */
async function listPagesBatch({ pluginId, chapters, title }) {
	const instance = await getInstancePlugin(pluginId);
	const chaptersNew = [];
	for (const chapter of chapters) {
		logger.info(`listPagesBatch ${title} -> ${chapter.volume}`);
		try {
			const pages = await enqueueAndWait(instance.id, 'listPages', {
				chapter: { id: chapter.id },
			});
			chaptersNew.push({ ...chapter, pages });
		} catch (error) {
			logger.error(error);
		}
	}
	return chaptersNew;
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
		pluginId: idPlugin,
	});
	const chaptersFiltered = formatChapters(chapters);
	const chaptersNotVolumeDuplicated = {};
	for (const chapter of chaptersFiltered) {
		if (`${chapter.volume}` in chaptersNotVolumeDuplicated) continue;
		chaptersNotVolumeDuplicated[chapter.volume] = chapter;
	}
	return Object.values(chaptersNotVolumeDuplicated);
}

const MangaService = {
	downloadMangas,
	listMangas,
	listChapters,
	listPages,
	listChaptersByManga,
	listPlugins,
	hasConnector: (id) => registry.hasConnector(id),
	listPagesBatch,
};

export default MangaService;

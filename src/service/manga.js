import sql from 'sql-bricks';
import * as registry from '../connectors/registry.js';
import database from '../infra/database.js';
import logger from '../infra/logger.js';
import { formatChapters } from '../utils/chapterFormat.js';
import * as mangaCatalog from '../utils/mangaCatalog.js';
import Download from './download.js';
import {
	enqueueAndWait,
	enqueueCatalogRefresh,
} from './queue/connectorQueue.js';

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
function requestStaleCatalogRefresh(connectorId) {
	// Fire-and-forget: the stale catalog is served now, the refresh lands on
	// disk later. A failed enqueue must not fail a request that has data.
	enqueueCatalogRefresh(connectorId).catch((error) =>
		logger.error('catalog refresh enqueue failed', {
			connectorId,
			error: error.message,
		}),
	);
}

// BullMQ's queue.add never rejects while Redis is unreachable (ioredis keeps
// retrying), so a request with no catalog to serve would hang instead of
// failing. Found by the stale-catalog-refresh verification.
const CATALOG_ENQUEUE_TIMEOUT_MS = 5000;

function enqueueCatalogRefreshWithTimeout(connectorId) {
	const enqueue = enqueueCatalogRefresh(connectorId);
	let timer;
	const timeout = new Promise((_resolve, reject) => {
		timer = setTimeout(
			() =>
				reject(
					new Error(
						`catalog refresh enqueue timed out after ${CATALOG_ENQUEUE_TIMEOUT_MS}ms for ${connectorId}`,
					),
				),
			CATALOG_ENQUEUE_TIMEOUT_MS,
		);
	});
	// The late outcome of an abandoned enqueue must not become an unhandled
	// rejection that kills the process.
	enqueue.catch(() => {});
	return Promise.race([enqueue, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Returns the cached catalog, or null when none is usable yet (refresh queued).
 * @example const mangas = await getCatalog('mangeek'); // null -> respond 202
 */
async function getCatalog(connectorId) {
	const cached = await mangaCatalog.loadCatalog(connectorId);
	if (!cached) {
		await enqueueCatalogRefreshWithTimeout(connectorId);
		return null;
	}
	if (await mangaCatalog.isStale(connectorId)) {
		requestStaleCatalogRefresh(connectorId);
	}
	return cached;
}

async function listMangas({ pluginId, title }) {
	const instance = await getInstancePlugin(pluginId);
	const mangas = await getCatalog(instance.id);
	if (!mangas) return null;

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

// Chapter discovery: asks each active link of a manga for chapters the
// manga does not have yet, records them and queues their download.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import logger from '../infra/logger.js';
import { countPipelineEvent } from '../infra/telemetry/business.js';
import BlockedChaptersRepository from '../repository/blockedChapters.js';
import ChaptersRepository from '../repository/chapters.js';
import MangaConnectorsRepository from '../repository/mangaConnectors.js';
import MangasRepository from '../repository/mangas.js';
import { toVolumeKey } from '../utils/chapterFormat.js';
import { blockKey, buildHeldLog, planDiscovery } from './chapterGap.js';
import ConnectorSwitch from './connectorSwitch.js';
import MangaService from './manga.js';
import { enqueueBackgroundTask } from './queue/backgroundQueue.js';

/**
 * Lists one connector's chapters, returning [] when the source fails so a
 * single broken connector (e.g. WiComix behind a paywall since 2026-11-11)
 * does not abort chapter discovery for the whole manga.
 * @example await listConnectorChaptersOrEmpty({ idManga: 1, connector })
 * @param {{ idManga: number, connector: { idPlugin: string, idMangaPlugin: string } }} params
 * @returns {Promise<Array<{ id: string, title: string, volume: string }>>}
 */
async function listConnectorChaptersOrEmpty({ idManga, connector }) {
	try {
		return await MangaService.listChaptersByManga({
			idPlugin: connector.idPlugin,
			mangaId: connector.idMangaPlugin,
		});
	} catch (error) {
		logger.error({
			idManga,
			idPlugin: connector.idPlugin,
			idMangaPlugin: connector.idMangaPlugin,
			status: 'listChaptersMissing_connector_failed',
			error: error.message,
		});
		return [];
	}
}

async function listActiveLinks({ idManga }) {
	const connectors = await MangaConnectorsRepository.listConnectorsByManga({
		idManga,
	});
	const active = connectors.filter((connector) => connector.isActive);
	const enabled = await Promise.all(
		active.map((link) => ConnectorSwitch.isConnectorEnabled(link.idPlugin)),
	);
	// A disabled connector is skipped up front instead of failing per link.
	return active.filter((_link, index) => enabled[index]);
}

async function listKnownVolumes({ idManga }) {
	const knownChapters = await ChaptersRepository.listChaptersByManga({
		idManga,
	});
	// Keys are normalized: the database returns "171.0000", sources say "171".
	return new Set(knownChapters.map((chapter) => toVolumeKey(chapter.volume)));
}

export async function listChaptersMissing({ idManga }) {
	const connectors = await listActiveLinks({ idManga });
	if (!connectors.length) return [];

	const knownVolumes = await listKnownVolumes({ idManga });
	const blockedKeys = await BlockedChaptersRepository.listBlockedKeysByManga({
		idManga,
	});
	const chaptersMissing = [];
	for (const connector of connectors) {
		const chapters = await listConnectorChaptersOrEmpty({ idManga, connector });
		for (const chapter of chapters) {
			if (blockedKeys.has(blockKey(connector, chapter))) continue;
			const key = toVolumeKey(chapter.volume);
			if (knownVolumes.has(key)) continue;
			knownVolumes.add(key);
			chaptersMissing.push({
				...chapter,
				idMangaConnector: connector.idMangaConnector,
				idPlugin: connector.idPlugin,
			});
		}
	}
	return chaptersMissing;
}

/**
 * Inserts one chapter and queues its download. Returns null when the volume
 * was already taken: UNIQUE(idManga, volume) makes the first source to answer
 * win, so the loser neither counts as discovered nor downloads.
 * @example await recordDiscoveredChapter({ idManga: 9, connector, chapter })
 */
async function recordDiscoveredChapter({ idManga, connector, chapter }) {
	const row = await ChaptersRepository.insertChapter({
		idManga,
		idMangaConnector: connector.idMangaConnector,
		idChapterPlugin: chapter.id,
		name: chapter.title,
		volume: chapter.volume,
	});
	if (!row) return null;
	countPipelineEvent('mangas.chapters.discovered', {
		source: connector.idPlugin,
		result: 'ok',
	});
	await enqueueBackgroundTask(
		'listPagesAndSend',
		{ idChapter: row.idChapter },
		`listPagesAndSend-${row.idChapter}`,
	);
	return {
		...chapter,
		idChapter: row.idChapter,
		idMangaConnector: connector.idMangaConnector,
		idPlugin: connector.idPlugin,
	};
}

function throwIfAnyLinkFailed({ idManga, outcomes }) {
	const reasons = outcomes
		.filter((outcome) => outcome.status === 'rejected')
		.map((outcome) => outcome.reason.message);
	if (!reasons.length) return;
	throw new Error(
		`updateMangaChapters: ${reasons.length} link(s) failed for idManga ${idManga}, expected all to record their chapters: ${reasons.join('; ')}`,
	);
}

function logHeldChapter(held) {
	logger.warn(buildHeldLog(held));
}

/**
 * Plans discovery over every active link: blocked chapters are skipped and
 * volumes behind a gap are held (see planDiscovery). planDiscovery settles
 * each link itself, so one failing link never abandons the others.
 * @example const { recorded, outcomes } = await discoverChaptersAcrossLinks({ idManga: 9 })
 */
async function discoverChaptersAcrossLinks({ idManga }) {
	const links = await listActiveLinks({ idManga });
	if (!links.length) return { recorded: [], outcomes: [] };
	return planDiscovery({
		links,
		storedVolumeKeys: await listKnownVolumes({ idManga }),
		blockedKeys: await BlockedChaptersRepository.listBlockedKeysByManga({
			idManga,
		}),
		listLinkChapters: (connector) =>
			listConnectorChaptersOrEmpty({ idManga, connector }),
		recordChapter: ({ link, chapter }) =>
			recordDiscoveredChapter({ idManga, connector: link, chapter }),
		reportHeld: (held) => logHeldChapter({ idManga, ...held }),
	});
}

export async function updateMangaChapters({ idManga }) {
	logger.info({ idManga, status: 'updateMangaChapters' });
	const manga = await MangasRepository.findMangaById({ idManga });
	if (!manga || manga.deletedAt) return [];
	const pathFolder = path.resolve('downloads', manga.title);
	await mkdir(pathFolder, { recursive: true }).catch(() => {});

	const { recorded, outcomes } = await discoverChaptersAcrossLinks({
		idManga,
	});
	// New chapters already queued their own download; this one batch retries
	// older chapters whose download failed before.
	if (recorded.length) {
		await enqueueBackgroundTask(
			'downloadMangasBatch',
			{ idManga },
			`downloadMangasBatch-${idManga}`,
		);
	}
	throwIfAnyLinkFailed({ idManga, outcomes });
	return recorded;
}

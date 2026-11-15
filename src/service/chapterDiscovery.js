// Chapter discovery: asks each active link of a manga for chapters the
// manga does not have yet, records them and queues their download.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import logger from '../infra/logger.js';
import { countPipelineEvent } from '../infra/telemetry/business.js';
import ChaptersRepository from '../repository/chapters.js';
import MangaConnectorsRepository from '../repository/mangaConnectors.js';
import MangasRepository from '../repository/mangas.js';
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
	return new Set(knownChapters.map((chapter) => `${chapter.volume}`));
}

export async function listChaptersMissing({ idManga }) {
	const connectors = await listActiveLinks({ idManga });
	if (!connectors.length) return [];

	const knownVolumes = await listKnownVolumes({ idManga });
	const chaptersMissing = [];
	for (const connector of connectors) {
		const chapters = await listConnectorChaptersOrEmpty({ idManga, connector });
		for (const chapter of chapters) {
			if (knownVolumes.has(`${chapter.volume}`)) continue;
			knownVolumes.add(`${chapter.volume}`);
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

/**
 * Discovers and records one link's new chapters on its own, so a slow
 * connector (e.g. WiComix queued behind its refreshCatalog) never delays the
 * chapters another connector already returned.
 * @example await discoverLinkChapters({ idManga: 9, connector, knownVolumes })
 */
async function discoverLinkChapters({ idManga, connector, knownVolumes }) {
	const chapters = await listConnectorChaptersOrEmpty({ idManga, connector });
	const recorded = [];
	for (const chapter of chapters) {
		if (knownVolumes.has(`${chapter.volume}`)) continue;
		const result = await recordDiscoveredChapter({
			idManga,
			connector,
			chapter,
		});
		if (result) recorded.push(result);
	}
	return recorded;
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

async function discoverChaptersAcrossLinks({ idManga }) {
	const connectors = await listActiveLinks({ idManga });
	if (!connectors.length) return { recorded: [], outcomes: [] };
	const knownVolumes = await listKnownVolumes({ idManga });
	// allSettled, not all: a failing insert must not abandon links still running.
	const outcomes = await Promise.allSettled(
		connectors.map((connector) =>
			discoverLinkChapters({ idManga, connector, knownVolumes }),
		),
	);
	const recorded = outcomes
		.filter((outcome) => outcome.status === 'fulfilled')
		.flatMap((outcome) => outcome.value);
	return { recorded, outcomes };
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

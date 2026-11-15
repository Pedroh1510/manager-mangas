import { Queue, QueueEvents, UnrecoverableError, Worker } from 'bullmq';
import { CatalogRefreshStoppedError } from '../../connectors/catalogRefreshStopped.js';
import {
	getConnectorClass,
	listConnectorIds,
} from '../../connectors/registry.js';
import logger from '../../infra/logger.js';
import { jobTelemetry, withJobMetrics } from '../../infra/telemetry/jobs.js';
import {
	CATALOG_VERSION,
	loadCatalog,
	readCatalogVersion,
	saveCatalog,
} from '../../utils/mangaCatalog.js';
import ConnectorSwitch from '../connectorSwitch.js';
import CoverService from '../covers/index.js';
import connection from './connection.js';

const CONCURRENCY_BY_CONNECTOR = {
	mangeek: 1,
	nexustoons: 2,
	nexusmangas: 1,
	blitztoons: 1,
	wicomix: 1,
};
const DEFAULT_CONCURRENCY = 1;

const queues = new Map();
const queueEvents = new Map();

function queueName(connectorId) {
	return `connector-${connectorId}`;
}

export function getConnectorQueue(connectorId) {
	if (!queues.has(connectorId)) {
		queues.set(
			connectorId,
			new Queue(queueName(connectorId), {
				connection,
				telemetry: jobTelemetry,
				// removeOnComplete can't be `true` here (unlike downloadQueue):
				// enqueueAndWait() reads the result back via job.waitUntilFinished(),
				// which needs the job's Redis hash to still exist when it polls right
				// after registering listeners. Instant removal races that poll and
				// throws "Missing key for job ... isFinished". A bounded retention
				// still keeps returnvalue payloads from growing unbounded in Redis.
				defaultJobOptions: {
					removeOnComplete: { age: 3600, count: 1000 },
					removeOnFail: { age: 10 },
				},
			}),
		);
	}
	return queues.get(connectorId);
}

function getQueueEvents(connectorId) {
	if (!queueEvents.has(connectorId)) {
		queueEvents.set(
			connectorId,
			new QueueEvents(queueName(connectorId), { connection }),
		);
	}
	return queueEvents.get(connectorId);
}

export async function enqueueAndWait(connectorId, operation, params) {
	const queue = getConnectorQueue(connectorId);
	const job = await queue.add(operation, params, { attempts: 3 });
	return job.waitUntilFinished(getQueueEvents(connectorId));
}

/**
 * Enqueues a background catalog refresh without waiting for it. While one is
 * waiting or active for the connector, further calls are no-ops.
 * @example await enqueueCatalogRefresh('mangeek');
 */
export async function enqueueCatalogRefresh(connectorId) {
	return getConnectorQueue(connectorId).add(
		'refreshCatalog',
		{},
		{ attempts: 3, deduplication: { id: `catalog-${connectorId}` } },
	);
}

async function scrapeCatalogUnlessStopped(connector) {
	try {
		return await connector._getMangas({
			shouldStop: async () =>
				!(await ConnectorSwitch.isConnectorEnabled(connector.id)),
		});
	} catch (error) {
		// By name: connectors may load their own copy of the error module.
		if (error?.name === CatalogRefreshStoppedError.name) return null;
		throw error;
	}
}

async function refreshCatalog(connector) {
	const mangas = await scrapeCatalogUnlessStopped(connector);
	// Disabled mid-run: an empty success that leaves the saved catalog alone.
	if (mangas === null) return 0;
	// An empty scrape (layout change, silent auth failure) must not overwrite
	// a good catalog on disk.
	if (!mangas.length) {
		throw new Error(
			`refreshCatalog: connector ${connector.id} returned 0 mangas, expected a non-empty list`,
		);
	}
	const previous = (await loadCatalog(connector.id)) ?? [];
	const previousVersion = await readCatalogVersion(connector.id);
	// Runs after the empty-scrape guard above, so a broken scrape never
	// deletes cover files (manga-covers AC 17).
	await CoverService.dropStaleCatalogCovers(connector.id, previous, mangas);
	// The catalog file is the job's last write: the refresh dedup key lives
	// until the job ends, so follow-up work runs as background jobs and a new
	// refresh request right after the file appears is not swallowed.
	await saveCatalog(connector.id, mangas);
	requestPostRefreshJobs(connector.id, previousVersion);
	return mangas.length;
}

function postRefreshJobs(connectorId, previousVersion) {
	const jobs = [
		[
			'syncConnectorCoverIndex',
			{ idPlugin: connectorId },
			`sync-cover-index-${connectorId}`,
		],
	];
	// The first v3 write is the one moment the links of this connector can
	// learn their alternative titles (alt-titles door 4).
	if (previousVersion !== CATALOG_VERSION) {
		jobs.push([
			'backfillAltTitles',
			{ idPlugin: connectorId },
			`backfill-alt-titles-${connectorId}`,
		]);
	}
	return jobs;
}

// Fire-and-forget: every await after saveCatalog would keep the refresh
// dedup key alive longer.
function requestPostRefreshJobs(connectorId, previousVersion) {
	// Imported lazily: backgroundQueue -> mangaAdmin -> connectorQueue would
	// otherwise close an import cycle at load time.
	import('./backgroundQueue.js')
		.then(async ({ enqueueBackgroundTask }) => {
			for (const job of postRefreshJobs(connectorId, previousVersion)) {
				await enqueueBackgroundTask(...job);
			}
		})
		.catch((error) =>
			logger.error({
				status: 'pos_refresh_enqueue_falhou',
				connectorId,
				error: error.message,
			}),
		);
}

const operations = {
	refreshCatalog,
	listChapters: (connector, params) => connector._getChapters(params.manga),
	listPages: (connector, params) => connector._getPages(params.chapter),
};

// What a job of a disabled connector answers instead of reaching the site.
// listPages fails rather than answering [], which would read as a chapter
// with no pages; the chapter stays pending until the connector is back.
function answerDisabled(operation, connectorId) {
	if (operation === 'refreshCatalog') return 0;
	if (operation === 'listChapters') return [];
	throw new UnrecoverableError(`Connector ${connectorId} is disabled`);
}

export function startConnectorWorkers() {
	return listConnectorIds().map((connectorId) => {
		const ConnectorClass = getConnectorClass(connectorId);
		const connector = new ConnectorClass();
		return new Worker(
			queueName(connectorId),
			withJobMetrics(queueName(connectorId), async (job) => {
				if (!(await ConnectorSwitch.isConnectorEnabled(connectorId))) {
					return answerDisabled(job.name, connectorId);
				}
				await connector.initialize();
				return operations[job.name](connector, job.data);
			}),
			{
				connection,
				telemetry: jobTelemetry,
				concurrency:
					CONCURRENCY_BY_CONNECTOR[connectorId] ?? DEFAULT_CONCURRENCY,
			},
		);
	});
}

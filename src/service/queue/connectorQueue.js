import { Queue, QueueEvents, Worker } from 'bullmq';
import {
	getConnectorClass,
	listConnectorIds,
} from '../../connectors/registry.js';
import {
	CATALOG_VERSION,
	loadCatalog,
	readCatalogVersion,
	saveCatalog,
} from '../../utils/mangaCatalog.js';
import CoverSuggestions from '../coverSuggestions/index.js';
import CoverService from '../covers/index.js';
import logger from '../../infra/logger.js';
import connection from './connection.js';
import { jobTelemetry, withJobMetrics } from '../../infra/telemetry/jobs.js';

const CONCURRENCY_BY_CONNECTOR = {
	mangeek: 1,
	nexustoons: 2,
	nexusmangas: 1,
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

async function refreshCatalog(connector) {
	const mangas = await connector._getMangas();
	// An empty scrape (layout change, silent auth failure) must not overwrite
	// a good catalog on disk.
	if (!mangas.length) {
		throw new Error(
			`refreshCatalog: connector ${connector.id} returned 0 mangas, expected a non-empty list`,
		);
	}
	const previous = (await loadCatalog(connector.id)) ?? [];
	const previousVersion = await readCatalogVersion(connector.id);
	await saveCatalog(connector.id, mangas);
	// The first v3 write is the one moment the links of this connector can
	// learn their alternative titles (alt-titles door 4).
	if (previousVersion !== CATALOG_VERSION) {
		requestAltTitlesBackfill(connector.id);
	}
	// Runs after the empty-scrape guard above, so a broken scrape never
	// deletes cover files (manga-covers AC 17).
	await CoverService.dropStaleCatalogCovers(connector.id, previous, mangas);
	await CoverSuggestions.syncConnectorIndex(connector.id);
	return mangas.length;
}

// Fire-and-forget: the refresh job keeps its catalog dedup key until it
// finishes, so every extra await here delays the next refresh request.
function requestAltTitlesBackfill(connectorId) {
	// Imported lazily: backgroundQueue -> mangaAdmin -> connectorQueue would
	// otherwise close an import cycle at load time.
	import('./backgroundQueue.js')
		.then(({ enqueueBackgroundTask }) =>
			enqueueBackgroundTask(
				'backfillAltTitles',
				{ idPlugin: connectorId },
				`backfill-alt-titles-${connectorId}`,
			),
		)
		.catch((error) =>
			logger.error({
				status: 'alt_titles_backfill_enqueue_falhou',
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

export function startConnectorWorkers() {
	return listConnectorIds().map((connectorId) => {
		const ConnectorClass = getConnectorClass(connectorId);
		const connector = new ConnectorClass();
		return new Worker(
			queueName(connectorId),
			withJobMetrics(queueName(connectorId), async (job) => {
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

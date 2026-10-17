import { Queue, Worker } from 'bullmq';
import { listConnectorIds } from '../../connectors/registry.js';
import CONFIG_ENV from '../../infra/env.js';
import connection from './connection.js';

const RATE_WINDOW_MS = 1000;
const queues = new Map();

function queueName(connectorId) {
	return `cover-hash-${connectorId}`;
}

/**
 * The hash queue of one connector, created once (cover-connector-suggestions
 * door 4: one queue per connector so each gets its own rate limit).
 * @example getCoverHashQueue('mangeek').name // 'cover-hash-mangeek'
 */
export function getCoverHashQueue(connectorId) {
	if (!queues.has(connectorId)) {
		queues.set(
			connectorId,
			new Queue(queueName(connectorId), {
				connection,
				defaultJobOptions: {
					removeOnComplete: true,
					removeOnFail: { age: 3600 },
				},
			}),
		);
	}
	return queues.get(connectorId);
}

/**
 * Every connector's hash queue, for bull-board and /queues-summary.
 * @example listCoverHashQueues().map((queue) => queue.name)
 */
export function listCoverHashQueues() {
	return listConnectorIds().map((id) => getCoverHashQueue(id));
}

/**
 * One worker per connector running `hashCover`, one job at a time and at
 * most COVER_HASH_RATE_PER_SEC jobs per second.
 * @example startCoverHashWorkers(CoverSuggestions.hashCover)
 */
export function startCoverHashWorkers(hashCover) {
	return listConnectorIds().map(
		(connectorId) =>
			new Worker(queueName(connectorId), (job) => hashCover(job.data), {
				connection,
				concurrency: 1,
				limiter: {
					max: CONFIG_ENV.COVER_HASH_RATE_PER_SEC,
					duration: RATE_WINDOW_MS,
				},
			}),
	);
}

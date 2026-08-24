import { Queue, QueueEvents, Worker } from 'bullmq';
import {
	getConnectorClass,
	listConnectorIds,
} from '../../connectors/registry.js';
import connection from './connection.js';

const CONCURRENCY_BY_CONNECTOR = {
	mangeek: 1,
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

const operations = {
	listMangas: (connector) => connector._getMangas(),
	listChapters: (connector, params) => connector._getChapters(params.manga),
	listPages: (connector, params) => connector._getPages(params.chapter),
};

export function startConnectorWorkers() {
	return listConnectorIds().map((connectorId) => {
		const ConnectorClass = getConnectorClass(connectorId);
		const connector = new ConnectorClass();
		return new Worker(
			queueName(connectorId),
			async (job) => {
				await connector.initialize();
				return operations[job.name](connector, job.data);
			},
			{
				connection,
				concurrency:
					CONCURRENCY_BY_CONNECTOR[connectorId] ?? DEFAULT_CONCURRENCY,
			},
		);
	});
}

// src/service/queue/backgroundQueue.js
import { Queue, Worker } from 'bullmq';
import MangaAdminService from '../mangaAdmin.js';
import KavitaCleanupService from '../kavita/cleanupReadChapters.js';
import connection from './connection.js';

const QUEUE_NAME = 'background-tasks';

const queue = new Queue(QUEUE_NAME, {
	connection,
	defaultJobOptions: { removeOnComplete: true, removeOnFail: { age: 10 } },
});

const operations = {
	updateAllMangas: () => MangaAdminService.updateMangas({}),
	updateMangaChapters: (data) => MangaAdminService.updateMangaChapters(data),
	downloadMangasBatch: (data) => MangaAdminService.downloadMangasBatch(data),
	listPagesAndSend: (data) => MangaAdminService.listPagesAndSend(data),
	cleanupReadChapters: (data) => KavitaCleanupService.cleanupReadChapters(data),
};

export async function enqueueBackgroundTask(operation, data, jobId) {
	await queue.add(operation, data, { attempts: 100, jobId });
}

export function startBackgroundWorker() {
	return new Worker(QUEUE_NAME, (job) => operations[job.name](job.data), {
		connection,
		concurrency: 3,
	});
}

export async function scheduleRecurringUpdate() {
	await queue.upsertJobScheduler(
		'every-12h',
		{ pattern: '0 11,19 * * *' },
		{ name: 'updateAllMangas' },
	);
}

export async function scheduleRecurringCleanup() {
	await queue.upsertJobScheduler(
		'kavita-cleanup-every-6h',
		{ pattern: '0 2,8,14,20 * * *' },
		{ name: 'cleanupReadChapters' },
	);
}

export function getBackgroundQueue() {
	return queue;
}

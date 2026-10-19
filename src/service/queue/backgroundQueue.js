// src/service/queue/backgroundQueue.js
import { Queue, Worker } from 'bullmq';
import AltTitlesService from '../altTitles.js';
import CoverSuggestions from '../coverSuggestions/index.js';
import KavitaCleanupService from '../kavita/cleanupReadChapters.js';
import MangaAdminService from '../mangaAdmin.js';
import connection from './connection.js';
import { RETRY_WITH_BACKOFF } from './retryPolicy.js';
import { jobTelemetry, withJobMetrics } from '../../infra/telemetry/jobs.js';

const QUEUE_NAME = 'background-tasks';

const queue = new Queue(QUEUE_NAME, {
	connection,
	telemetry: jobTelemetry,
	defaultJobOptions: { removeOnComplete: true, removeOnFail: { age: 10 } },
});

const operations = {
	updateAllMangas: () => MangaAdminService.updateMangas({}),
	updateMangaChapters: (data) => MangaAdminService.updateMangaChapters(data),
	downloadMangasBatch: (data) => MangaAdminService.downloadMangasBatch(data),
	listPagesAndSend: (data) => MangaAdminService.listPagesAndSend(data),
	cleanupReadChapters: (data) => KavitaCleanupService.cleanupReadChapters(data),
	syncCoverHashIndex: () => CoverSuggestions.syncAllIndexes(),
	matchCoverSuggestions: () => CoverSuggestions.matchAll(),
	matchMangaSuggestions: (data) => CoverSuggestions.matchMangaSuggestions(data),
	backfillAltTitles: (data) => AltTitlesService.backfill(data),
};

export async function enqueueBackgroundTask(operation, data, jobId) {
	await queue.add(operation, data, { ...RETRY_WITH_BACKOFF, jobId });
}

export function startBackgroundWorker() {
	return new Worker(
		QUEUE_NAME,
		withJobMetrics(QUEUE_NAME, (job) => operations[job.name](job.data)),
		{ connection, concurrency: 3, telemetry: jobTelemetry },
	);
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

export async function scheduleRecurringCoverIndexSync() {
	await queue.upsertJobScheduler(
		'cover-index-sync-daily',
		{ pattern: '0 3 * * *' },
		{ name: 'syncCoverHashIndex' },
	);
}

// 30 min after updateAllMangas (11h/19h) so chapter jobs get a head start.
export async function scheduleRecurringCoverMatching() {
	await queue.upsertJobScheduler(
		'cover-matching-every-12h',
		{ pattern: '30 11,19 * * *' },
		{ name: 'matchCoverSuggestions' },
	);
}

export function getBackgroundQueue() {
	return queue;
}

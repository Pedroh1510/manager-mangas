import { Queue, Worker } from 'bullmq';
import { PageNotFoundError } from '../imageDownloader.js';
import MangaService from '../manga.js';
import connection from './connection.js';

const QUEUE_NAME = 'download';

const queue = new Queue(QUEUE_NAME, {
	connection,
	defaultJobOptions: { removeOnComplete: true, removeOnFail: { age: 10 } },
});

export async function enqueueDownload(data, jobId) {
	await queue.add('teste', data, { attempts: 100, jobId });
}

export async function processDownloadJob(job) {
	const { manga, chapter, pages, idChapter } = job.data;
	try {
		await MangaService.downloadMangas({ manga, chapter, pages, idChapter });
	} catch (error) {
		if (error instanceof PageNotFoundError) {
			job.discard();
		}
		throw error;
	}
}

export function startDownloadWorker(concurrency) {
	return new Worker(QUEUE_NAME, processDownloadJob, {
		connection,
		concurrency,
		useWorkerThreads: false,
	});
}

export function getDownloadQueue() {
	return queue;
}

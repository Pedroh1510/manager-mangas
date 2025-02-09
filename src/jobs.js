import { Queue, Worker } from 'bullmq';
import CONFIG_ENV from './infra/env.js';

const connection = {
	host: CONFIG_ENV.REDIS_HOST,
	port: CONFIG_ENV.REDIS_PORT
};
const defaultJobOptions = {
	removeOnComplete: {
		age: 10
	},
	removeOnFail: {
		age: 10
	}
};

const updateMangasQueue = new Queue('update-mangas', {
	connection,
	defaultJobOptions
});
const updateMangaQueue = new Queue('manga', {
	connection,
	defaultJobOptions
});
const downloadBatchQueue = new Queue('download-batch', {
	connection,
	defaultJobOptions
});

const listPagesQueue = new Queue('list-pages', {
	connection,
	defaultJobOptions
});
const downloadQueue = new Queue('download', {
	connection,
	defaultJobOptions
});
async function initWorkers() {
	const worker = new Worker(
		updateMangasQueue.name,
		async (job) => {
			logger.info('worker1');

			await fetch(`${CONFIG_ENV.URL}/mangas/adm/update-mangas`);
			logger.info('worker1 fim');
		},
		{
			connection,
			concurrency: 1
		}
	);
	const workerUpdateManga = new Worker(
		updateMangaQueue.name,
		async (job) => {
			logger.info('workerUpdateManga');

			await fetch(
				`${CONFIG_ENV.URL}/mangas/adm/chapters?title=${job.data.title}`
			);
			logger.info('workerUpdateManga fim');
		},
		{
			connection,
			concurrency: 1
		}
	);
	const worker2 = new Worker(
		downloadBatchQueue.name,
		async (job) => {
			logger.info('worker2');

			await fetch(`${CONFIG_ENV.URL}/mangas/adm/download-batch`);
			logger.info('worker2 fim');
			return;
		},
		{
			connection,
			concurrency: 1
		}
	);
	const worker3 = new Worker(
		downloadQueue.name,
		async (job) => {
			const { manga, chapter, pages, idChapter } = job.data;
			logger.info(`worker3 ${manga} -- ${chapter} --> inicio`);
			await axios
				.get(`${CONFIG_ENV.URL}/mangas/download`, {
					params: {
						manga,
						chapter,
						pages,
						idChapter
					}
				})
				.then((res) => res.data);
			logger.info(`worker3 ${manga} -- ${chapter} --> fim`);
			return;
		},
		{
			connection,
			concurrency: 3
		}
	);
	const listPagesWorker = new Worker(
		listPagesQueue.name,
		async (job) => {
			const { idChapterPlugin, pluginId, title, volume, idChapter } = job.data;
			logger.info(`listPagesQueue ${title} -- ${volume} --> inicio`);
			await axios
				.get(`${CONFIG_ENV.URL}/mangas/adm/chapters/pages`, {
					params: {
						idChapterPlugin,
						pluginId,
						title,
						volume,
						idChapter
					}
				})
				.then((res) => res.data);
			logger.info(`worker3 ${title} -- ${volume} --> fim`);
			return;
		},
		{
			connection,
			concurrency: 1
		}
	);
}
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';
import { ExpressAdapter } from '@bull-board/express';
import axios from 'axios';
import logger from './infra/logger.js';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/queues');

createBullBoard({
	queues: [
		new BullMQAdapter(updateMangasQueue),
		new BullMQAdapter(downloadBatchQueue),
		new BullMQAdapter(downloadQueue),
		new BullMQAdapter(updateMangaQueue),
		new BullMQAdapter(listPagesQueue)
	],
	serverAdapter
});

async function init() {
	logger.info('iniciado workers');
	await updateMangasQueue.upsertJobScheduler('every-hour', {
		every: 1000 * 60 * 60
	});
	await initWorkers();
}
const jobs = {
	// workers: [worker, worker2, worker3, workerUpdateManga],
	// workers: [],
	queues: {
		updateMangasQueue: async () => {
			await updateMangasQueue.add('teste', {});
		},
		downloadBatchQueue: async () => {
			await downloadBatchQueue.add('teste', {}, { attempts: 100 });
		},
		downloadQueue: async (data) => {
			await downloadQueue.add('teste', data, { attempts: 100 });
		},
		updateMangaQueue: async (data) => {
			await updateMangaQueue.add('teste', data, { attempts: 100 });
		},
		listPagesQueue: async (data) => {
			await listPagesQueue.add('teste', data, { attempts: 100 });
		}
	},
	init,
	router: serverAdapter.getRouter()
};

export default jobs;

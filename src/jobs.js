import { Queue, Worker } from 'bullmq';
import CONFIG_ENV from './infra/env.js';

const connection = {
	host: CONFIG_ENV.REDIS_HOST,
	port: CONFIG_ENV.REDIS_PORT
};
const defaultJobOptions = {
	removeOnComplete: true,
	removeOnFail: {
		age: 10
	}
};

const processQueue = new Queue('process', {
	connection,
	defaultJobOptions
});

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
	// const worker = new Worker(
	// 	processQueue.name,
	// 	async (job) => {
	// 		const workerName = `worker ${job.name}`;
	// 		logger.info(`${workerName}`);
	// 		const fromTo = {
	// 			updateAll: async () => {
	// 				await fetch(`${CONFIG_ENV.URL}/mangas/adm/update-mangas`);
	// 			},
	// 			updateChapters: async () => {
	// 				await fetch(
	// 					`${CONFIG_ENV.URL}/mangas/adm/chapters?title=${job.data.title}`
	// 				);
	// 			},
	// 			downloadBatch: async () => {
	// 				await api.get('mangas/adm/download-batch', {
	// 					params: {
	// 						title: job.data?.title
	// 					}
	// 				});
	// 			},
	// 			listPages: async () => {
	// 				const { idChapterPlugin, pluginId, title, volume, idChapter } =
	// 					job.data;
	// 				logger.info(`listPagesQueue ${title} -- ${volume}`);
	// 				await axios.get(`${CONFIG_ENV.URL}/mangas/adm/chapters/pages`, {
	// 					params: {
	// 						idChapterPlugin,
	// 						pluginId,
	// 						title,
	// 						volume,
	// 						idChapter
	// 					}
	// 				});
	// 			}
	// 		};
	// 		if (Object.keys(fromTo).includes(job.name)) {
	// 			await fromTo[job.name]();
	// 		}

	// 		logger.info(`${workerName} fim`);
	// 	},
	// 	{
	// 		connection,
	// 		concurrency: 1
	// 	}
	// );
	const worker = new Worker(
		updateMangasQueue.name,
		async (job) => {
			console.log(job.name);
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
			console.log({ name: job.name });
			if (job.name === 'updateManga') {
				logger.info('workerUpdateManga');

				await fetch(
					`${CONFIG_ENV.URL}/mangas/adm/chapters?title=${job.data.title}`
				);
				logger.info('workerUpdateManga fim');
			} else {
				const { idChapterPlugin, pluginId, title, volume, idChapter } =
					job.data;
				logger.info(`listPagesQueue ${title} -- ${volume} --> inicio`);
				await axios.get(`${CONFIG_ENV.URL}/mangas/adm/chapters/pages`, {
					params: {
						idChapterPlugin,
						pluginId,
						title,
						volume,
						idChapter
					}
				});
			}
		},
		{
			connection,
			concurrency: 1
		}
	);
	const worker2 = new Worker(
		downloadBatchQueue.name,
		async (job) => {
			console.log(job.name);

			logger.info('worker2');
			await api.get('mangas/adm/download-batch', {
				params: {
					title: job.data?.title
				}
			});
			logger.info('worker2 fim');

			return;
		},
		{
			connection,
			concurrency: 1
		}
	);
	const listPagesWorker = new Worker(
		listPagesQueue.name,
		async (job) => {
			const { idChapterPlugin, pluginId, title, volume, idChapter } = job.data;
			logger.info(`listPagesQueue ${title} -- ${volume} --> inicio`);
			await axios.get(`${CONFIG_ENV.URL}/mangas/adm/chapters/pages`, {
				params: {
					idChapterPlugin,
					pluginId,
					title,
					volume,
					idChapter
				}
			});
			logger.info(`worker3 ${title} -- ${volume} --> fim`);
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
			await MangasService.downloadMangas({
				manga,
				chapter,
				pages,
				idChapter
			});
			logger.info(`worker3 ${manga} -- ${chapter} --> fim`);
			return;
		},
		{
			connection,
			concurrency: CONFIG_ENV.CONCURRENCY,
			useWorkerThreads: false
		}
	);
}
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';
import { ExpressAdapter } from '@bull-board/express';
import axios from 'axios';
import logger from './infra/logger.js';
import MangasService from './model/mangas.js';
import api from './infra/api.js';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/queues');

createBullBoard({
	queues: [
		new BullMQAdapter(updateMangasQueue),
		new BullMQAdapter(downloadBatchQueue),
		new BullMQAdapter(updateMangaQueue),
		new BullMQAdapter(listPagesQueue),
		new BullMQAdapter(downloadQueue)
		// new BullMQAdapter(processQueue)
	],
	serverAdapter
});

async function init() {
	if (CONFIG_ENV.ENABLE_JOB) {
		logger.info('iniciado workers');
		await updateMangasQueue.upsertJobScheduler(
			'every-12h',
			{
				// every: 1000 * 60 * 60 * 12,
				pattern: '0 11,19 * * *'
			},
			{
				name: 'updateAll'
			}
		);
		// await updateMangasQueue.upsertJobScheduler('every-hour', {
		// 	every: 1000 * 60 * 60
		// });
		await initWorkers();
	}
}
const jobs = {
	// workers: [worker, worker2, worker3, workerUpdateManga],
	// workers: [],
	queues: {
		updateMangasQueue: async (id = 'updateAll') => {
			// await processQueue.add('updateAll', {}, { jobId: id });
			await updateMangasQueue.add('teste', {}, { jobId: id });
		},
		downloadBatchQueue: async (data, id) => {
			// await processQueue.add('downloadBatch', data ?? {}, {
			// 	attempts: 100,
			// 	jobId: id,
			// 	priority: 2
			// });
			await downloadBatchQueue.add('teste', data ?? {}, {
				attempts: 100,
				jobId: id
			});
		},
		downloadQueue: async (data, id) => {
			await downloadQueue.add('teste', data, { attempts: 100, jobId: id });
		},
		updateMangaQueue: async (data, id) => {
			// await processQueue.add('updateChapters', data ?? {}, {
			// 	attempts: 100,
			// 	jobId: id,
			// 	priority: 3
			// });

			await updateMangaQueue.add('updateManga', data, {
				attempts: 100,
				jobId: id
			});
		},
		listPagesQueue: async (data, id) => {
			// await processQueue.add('listPages', data ?? {}, {
			// 	attempts: 100,
			// 	jobId: id,
			// 	priority: 1
			// });

			console.log(2);
			await updateMangaQueue.add('listPages', data, {
				attempts: 100,
				jobId: id
			});
			// await listPagesQueue.add('listPages', data, { attempts: 100, jobId: id });
		}
	},
	init,
	router: serverAdapter.getRouter()
};

export default jobs;

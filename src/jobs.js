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
const downloadBatchQueue = new Queue('download-batch', {
	connection,
	defaultJobOptions
});
const downloadQueue = new Queue('download', {
	connection,
	defaultJobOptions
});
const worker = new Worker(
	updateMangasQueue.name,
	async (job) => {
		console.log('worker1');

		await fetch(`${CONFIG_ENV.URL}/mangas/adm/update-mangas`);
		console.log('worker1 fim');
	},
	{
		connection,
		concurrency: 1
	}
);
const worker2 = new Worker(
	downloadBatchQueue.name,
	async (job) => {
		console.log('worker2');

		await fetch(`${CONFIG_ENV.URL}/mangas/adm/download-batch`);
		console.log('worker2 fim');
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
		console.log('worker3');

		const { manga, chapter, pages, idChapter } = job.data;
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
		console.log('worker3 fim');
		return;
	},
	{
		connection,
		concurrency: 1
	}
);

import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';
import { ExpressAdapter } from '@bull-board/express';
import axios from 'axios';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/queues');

createBullBoard({
	queues: [
		new BullMQAdapter(updateMangasQueue),
		new BullMQAdapter(downloadBatchQueue),
		new BullMQAdapter(downloadQueue)
	],
	serverAdapter
});

async function init() {
	console.log('iniciado workers');
	await updateMangasQueue.upsertJobScheduler('every-hour', {
		every: 1000 * 60 * 60
	});
}
const jobs = {
	workers: [worker, worker2, worker3],
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
		}
	},
	init,
	router: serverAdapter.getRouter()
};

export default jobs;

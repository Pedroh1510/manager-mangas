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
const worker = new Worker(
	updateMangasQueue.name,
	async (job) => {
		console.log('worker1');

		await fetch('http://localhost:3001/mangas/adm/update-mangas');
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

		const response = await fetch(
			'http://localhost:3001/mangas/adm/download-batch'
		);
		const body = await response.json();
		if (body.totalDownloaded) {
			console.log('worker2 enviando');
			await downloadBatchQueue.add('download', {});
		}
		console.log('worker2 fim');
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

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/queues');

createBullBoard({
	queues: [
		new BullMQAdapter(updateMangasQueue),
		new BullMQAdapter(downloadBatchQueue)
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
	workers: [worker, worker2],
	queues: {
		updateMangasQueue: async () => {
			await updateMangasQueue.add('teste', {});
		},
		downloadBatchQueue: async () => {
			await downloadBatchQueue.add('teste', {});
		}
	},
	init,
	router: serverAdapter.getRouter()
};

export default jobs;

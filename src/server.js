import 'express-async-errors';
import express from 'express';
import morgan from 'morgan';

import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';
import { ExpressAdapter } from '@bull-board/express';
import cors from 'cors';
import { listConnectorIds, registerForTests } from './connectors/registry.js';
import TestFixtureConnector from './connectors/testFixture/TestFixtureConnector.js';
import CONFIG_ENV from './infra/env.js';
import { ValidationError } from './infra/errors.js';
import logger from './infra/logger.js';
import router from './routes.js';
import {
	getBackgroundQueue,
	scheduleRecurringUpdate,
	startBackgroundWorker,
} from './service/queue/backgroundQueue.js';
import {
	getConnectorQueue,
	startConnectorWorkers,
} from './service/queue/connectorQueue.js';
import {
	getDownloadQueue,
	startDownloadWorker,
} from './service/queue/downloadQueue.js';

if (CONFIG_ENV.ENV === 'test') {
	registerForTests('test-fixture', TestFixtureConnector);
}

const server = express();
server.use(cors('*'));
server.use(express.json({}));
server.use(express.urlencoded({ extended: true }));
server.use(
	morgan('tiny', {
		stream: {
			write: (message) => {
				if (message.includes('GET /queues/api')) return;
				logger.http(message.trim());
			},
		},
	}),
);

server.use(router);

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/queues');
createBullBoard({
	queues: [
		...listConnectorIds().map((id) => new BullMQAdapter(getConnectorQueue(id))),
		new BullMQAdapter(getBackgroundQueue()),
		new BullMQAdapter(getDownloadQueue()),
	],
	serverAdapter,
});
server.use('/queues', serverAdapter.getRouter());

server.use((error, _req, res, _next) => {
	if (error.statusCode) {
		return res.status(error.statusCode).send(error);
	}
	if (error.name === 'ValidationError') {
		const errorNew = new ValidationError({
			message: error.message,
			action: 'Verifique a request e tente novamente.',
		});
		return res.status(errorNew.statusCode).send(errorNew);
	}
	logger.error(`Error: ${error}\nStack: ${error.stack}\n`);
	return res.status(500).send('Something broke!');
});

startConnectorWorkers();

const serverInstance = server.listen(CONFIG_ENV.PORT, async () => {
	logger.info(`Server running on port ${CONFIG_ENV.PORT}`);
	startDownloadWorker(CONFIG_ENV.CONCURRENCY);
	if (CONFIG_ENV.ENABLE_JOB) {
		startBackgroundWorker();
		await scheduleRecurringUpdate();
	}
});

function graceful(code) {
	console.log(`${code} signal received.`);
	let status = 0;
	return (e) => {
		if (e) {
			logger.error(e);
			status = 1;
		}
		serverInstance.close(async (error) => {
			if (error) {
				logger.error(error);
				status = 1;
			}
			await logger.close();
			process.exit(status);
		});
	};
}

process.on('SIGTERM', graceful('SIGTERM'));

process.on('SIGINT', graceful('SIGINT'));

process.on('uncaughtException', graceful('uncaughtException'));
process.on('unhandledRejection', graceful('unhandledRejection'));

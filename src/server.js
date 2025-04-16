import 'express-async-errors';
import express from 'express';
import morgan from 'morgan';

import CONFIG_ENV from './infra/env.js';
import { ValidationError } from './infra/errors.js';
import logger from './infra/logger.js';
import jobs from './jobs.js';
import MangasService from './model/mangas.js';
import router from './routes.js';

const server = express();
server.use(express.json({}));
server.use(express.urlencoded({ extended: true }));
server.use(
	morgan('tiny', {
		stream: {
			write: (message) => {
				if (message.includes('GET /queues/api')) return;
				logger.http(message.trim());
			}
		}
	})
);

await MangasService.initMangas();

server.use(router);

server.use('/queues', jobs.router);

server.use((error, _req, res, _next) => {
	if (error.statusCode) {
		return res.status(error.statusCode).send(error);
	}
	if (error.name === 'ValidationError') {
		const errorNew = new ValidationError({
			message: error.message,
			action: 'Verifique a request e tente novamente.'
		});
		return res.status(errorNew.statusCode).send(errorNew);
	}
	logger.error(`Error: ${error}\nStack: ${error.stack}\n`);
	return res.status(500).send('Something broke!');
});

const serverInstance = server.listen(CONFIG_ENV.PORT, async () => {
	logger.info(`Server running on port ${CONFIG_ENV.PORT}`);
	await jobs.init();
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

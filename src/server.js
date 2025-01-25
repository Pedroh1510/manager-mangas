import 'express-async-errors';
import express from 'express';
import morgan from 'morgan';

import CONFIG_ENV from './infra/env.js';
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
			write: (message) => logger.http(message.trim()),
		},
	}),
);

await MangasService.initMangas();

server.use(router);

server.use('/queues', jobs.router);

server.use((error, _req, res, _next) => {
	if (error.statusCode) {
		return res.status(error.statusCode).send(error);
	}
	logger.error(`Error: ${error}\nStack: ${error.stack}\n`);
	return res.status(500).send('Something broke!');
});

server.listen(CONFIG_ENV.PORT, async () => {
	logger.info(`Server running on port ${CONFIG_ENV.PORT}`);
	await jobs.init();
});

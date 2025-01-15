import 'express-async-errors';
import express from 'express';
import morgan from 'morgan';

import MangasService from './model/mangas.js';
import StatusService from './model/status.js';
import MigrationsService from './model/migrations.js';
import jobs from './jobs.js';
import CONFIG_ENV from './infra/env.js';

const server = express();
server.use(express.json({}));
server.use(express.urlencoded({ extended: true }));
server.use(
	morgan('tiny', {
		stream: {
			write: (message) => console.log(message.trim())
		}
	})
);

await MangasService.initMangas();

server.post('/mangas/adm', async (req, res) => {
	const { title, idPlugin } = req.body;
	const response = await MangasService.registerManga({ title, idPlugin });

	res.status(201).send(response);
});
server.get('/mangas/adm/download-batch', async (_req, res) => {
	const response = await MangasService.downloadMangasBatch();

	res.status(200).send(response);
});
server.get('/mangas/adm/update-mangas', async (_req, res) => {
	const response = await MangasService.updateMangas();

	res.status(200).send(response);
});
server.get('/mangas/adm/:title', async (req, res) => {
	const { title } = req.params;
	const response = await MangasService.listMangasRegistered({ title });

	res.status(200).send(response);
});
server.post('/mangas/adm/:title/chapters', async (req, res) => {
	const { title } = req.params;
	const response = await MangasService.updateMangaChapters({ title });

	res.status(200).send(response);
});

server.get('/mangas/download', async (req, res) => {
	const { manga, chapter, pages, idChapter } = req.query;
	await MangasService.downloadMangas({ chapter, manga, pages, idChapter });

	res.status(200).send();
});
server.get('/mangas/:pluginId', async (req, res) => {
	const { pluginId } = req.params;
	const mangas = await MangasService.listMangas({ pluginId });

	res.status(200).send(mangas);
});
server.get('/mangas/:pluginId/manga', async (req, res) => {
	const { pluginId } = req.params;
	const { mangaId } = req.query;

	const chapters = await MangasService.listChapters({ mangaId, pluginId });
	res.status(200).send(chapters);
});
server.get('/mangas/:pluginId/pages', async (req, res) => {
	const { pluginId } = req.params;
	const { chapterId } = req.query;
	const pages = await MangasService.listPages({ chapterId, pluginId });

	res.status(200).send(JSON.stringify(pages, null, 2));
});

server.get('/status', async (_, res) => {
	const status = await StatusService.getDatabaseStatus();
	res.status(200).json(status);
});

server.get('/migrations', async (_, res) => {
	const migrations = await MigrationsService.dryRun();
	res.status(200).json(migrations);
});
server.post('/migrations', async (_, res) => {
	const migrations = await MigrationsService.run();
	res.status(201).json(migrations);
});

server.use('/queues', jobs.router);

server.use((error, _req, res, _next) => {
	if (error.statusCode) {
		return res.status(error.statusCode).send(error);
	}
	console.error(error);
	return res.status(500).send('Something broke!');
});

server.listen(CONFIG_ENV.PORT, async () => {
	console.log(`Server running on port ${CONFIG_ENV.PORT}`);
	await jobs.init();
});

import path from 'node:path';
import express from 'express';
import { mkdir, rm } from 'node:fs/promises';

import { downloadImage } from './utils/download.js';
import MangasService from './model/mangas.js';

const server = express();
await MangasService.initMangas();

server.get('/mangas/download', async (req, res) => {
	const { manga, chapter, pages } = req.query;
	await MangasService.downloadMangas({ chapter, manga, pages });

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

server.use((req, res, next, err) => {
	if (err) {
		return res.status(500).send({ error: err.message, stack: err.stack });
	}

	res.status(200).send();
});

server.listen(3001, () => {
	console.log('Server running on port 3001');
});

import express from 'express';
import MangasService from '../model/mangas.js';

const mangasAdmController = express();
export default mangasAdmController;

mangasAdmController.post('/', async (req, res) => {
	const { title, idPlugin } = req.body;
	const response = await MangasService.registerManga({ title, idPlugin });

	res.status(201).send(response);
});

mangasAdmController.get('/', async (req, res) => {
	const { title } = req.query;
	const response = await MangasService.listMangasRegistered({ title });

	res.status(200).send(response);
});
mangasAdmController.post('/cookie', async (req, res) => {
	const { cookie, idPlugin } = req.body;
	const response = await MangasService.registerCookie({ cookie, idPlugin });

	res.status(201).send(response);
});
mangasAdmController.get('/download-batch', async (_req, res) => {
	const response = await MangasService.downloadMangasBatch();

	res.status(200).send(response);
});
mangasAdmController.get('/update-mangas', async (_req, res) => {
	const response = await MangasService.updateMangas();

	res.status(200).send(response);
});
mangasAdmController.get('/chapters/pages', async (req, res) => {
	const { idChapterPlugin, pluginId, title, volume, idChapter } = req.query;
	const response = await MangasService.listPagesAndSend({
		idChapterPlugin,
		pluginId,
		title,
		volume,
		idChapter
	});

	res.status(200).send(response);
});
mangasAdmController.get('/chapters', async (req, res) => {
	const { title } = req.query;
	const response = await MangasService.updateMangaChapters({
		title
	});

	res.status(200).send(response);
});

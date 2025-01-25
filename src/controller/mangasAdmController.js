import express from 'express';
import MangasAdmService from '../model/mangasAdm.js';

const mangasAdmController = express();
export default mangasAdmController;

mangasAdmController.post('/', async (req, res) => {
	const { title, idPlugin } = req.body;
	const response = await MangasAdmService.registerManga({ title, idPlugin });

	res.status(201).send(response);
});

mangasAdmController.get('/', async (req, res) => {
	const { title } = req.query;
	const response = await MangasAdmService.listMangasRegistered({ title });

	res.status(200).send(response);
});
mangasAdmController.post('/cookie', async (req, res) => {
	const { cookie, idPlugin } = req.body;
	const response = await MangasAdmService.registerCookie({ cookie, idPlugin });

	res.status(201).send(response);
});
mangasAdmController.get('/download-batch', async (_req, res) => {
	const response = await MangasAdmService.downloadMangasBatch();

	res.status(200).send(response);
});
mangasAdmController.get('/update-mangas', async (_req, res) => {
	const response = await MangasAdmService.updateMangas();

	res.status(200).send(response);
});
mangasAdmController.get('/chapters/pages', async (req, res) => {
	const { idChapterPlugin, pluginId, title, volume, idChapter } = req.query;
	const response = await MangasAdmService.listPagesAndSend({
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
	const response = await MangasAdmService.updateMangaChapters({
		title
	});

	res.status(200).send(response);
});

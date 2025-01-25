import express from 'express';
import MangasService from '../model/mangas.js';
import mangasAdmController from './mangasAdmController.js';

const mangasController = express();
export default mangasController;

mangasController.use('/adm', mangasAdmController);

mangasController.get('/download', async (req, res) => {
	const { manga, chapter, pages, idChapter } = req.query;
	await MangasService.downloadMangas({ chapter, manga, pages, idChapter });

	res.status(200).send();
});
mangasController.get('/:pluginId', async (req, res) => {
	const { pluginId } = req.params;
	const { title } = req.query;

	const mangas = await MangasService.listMangas({ pluginId, title });

	res.status(200).send(mangas);
});
mangasController.get('/:pluginId/manga', async (req, res) => {
	const { pluginId } = req.params;
	const { mangaId } = req.query;

	const chapters = await MangasService.listChapters({ mangaId, pluginId });
	res.status(200).send(chapters);
});
mangasController.get('/:pluginId/pages', async (req, res) => {
	const { pluginId } = req.params;
	const { chapterId } = req.query;
	const pages = await MangasService.listPages({ chapterId, pluginId });

	res.status(200).send(JSON.stringify(pages, null, 2));
});

import express from 'express';
import MangasService from '../model/mangas.js';
import mangasAdmController from './mangasAdmController.js';

const mangasController = express();
export default mangasController;
/**
 * @swagger
 * tags:
 *   name: Manga
 *   description: Manga
 */

mangasController.use('/adm', mangasAdmController);

/**
 * @swagger
 * /mangas/plugins:
 *   get:
 *     tags: [Manga]
 *     description: list plugins
 *     parameters:
 *       - name: name
 *         in: query
 *         required: false
 *         type: string
 *     responses:
 *       200:
 *         description: Returns a list plugins
 */
mangasController.get('/plugins', async (req, res) => {
	const { name } = req.query;
	const response = await MangasService.listPlugins({ name });

	res.status(200).send(response);
});

/**
 * @swagger
 * /mangas/download:
 *   get:
 *     tags: [Manga]
 *     description: download pages
 *     parameters:
 *       - name: manga
 *         in: query
 *         required: true
 *         type: string
 *       - name: chapter
 *         in: query
 *         required: true
 *         type: string
 *       - name: idChapter
 *         in: query
 *         required: true
 *         type: string
 *       - name: pages
 *         in: query
 *         required: true
 *         schema:
 *           type: array
 *           required: true
 *           item:
 *             type: string
 *     responses:
 *       200:
 *         description: Returns a list pages
 */
mangasController.get('/download', async (req, res) => {
	const { manga, chapter, pages, idChapter } = req.query;
	await MangasService.downloadMangas({ chapter, manga, pages, idChapter });

	res.status(200).send();
});

/**
 * @swagger
 * /mangas/{idPlugin}:
 *   get:
 *     tags: [Manga]
 *     description: list mangas
 *     parameters:
 *       - name: idPlugin
 *         in: path
 *         required: true
 *         type: string
 *       - name: title
 *         in: query
 *         required: false
 *         type: string
 *     responses:
 *       200:
 *         description: Returns a list mangas
 */
mangasController.get('/:pluginId', async (req, res) => {
	const { pluginId } = req.params;
	const { title } = req.query;

	const mangas = await MangasService.listMangas({ pluginId, title });

	res.status(200).send(mangas);
});

/**
 * @swagger
 * /mangas/{idPlugin}/manga:
 *   get:
 *     tags: [Manga]
 *     description: list chapters manga
 *     parameters:
 *       - name: idPlugin
 *         in: path
 *         required: true
 *         type: string
 *       - name: mangaId
 *         in: query
 *         required: true
 *         type: string
 *     responses:
 *       200:
 *         description: Returns a list chapters
 */
mangasController.get('/:pluginId/manga', async (req, res) => {
	const { pluginId } = req.params;
	const { mangaId } = req.query;

	const chapters = await MangasService.listChapters({ mangaId, pluginId });
	res.status(200).send(chapters);
});

/**
 * @swagger
 * /mangas/{idPlugin}/pages:
 *   get:
 *     tags: [Manga]
 *     description: list pages
 *     parameters:
 *       - name: idPlugin
 *         in: path
 *         required: true
 *         type: string
 *       - name: chapterId
 *         in: query
 *         required: true
 *         type: string
 *     responses:
 *       200:
 *         description: Returns a list pages
 */
mangasController.get('/:pluginId/pages', async (req, res) => {
	const { pluginId } = req.params;
	const { chapterId } = req.query;
	const pages = await MangasService.listPages({ chapterId, pluginId });

	res.status(200).send(JSON.stringify(pages, null, 2));
});

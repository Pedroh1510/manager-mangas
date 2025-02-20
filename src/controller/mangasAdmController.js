import express from 'express';
import MangasAdmService from '../model/mangasAdm.js';
import MangasAdmValidator from '../validators/mangasAdmValidator.js';

const mangasAdmController = express();
export default mangasAdmController;
/**
 * @swagger
 * tags:
 *   name: MangaAdm
 *   description: MangaAdm
 */

/**
 * @swagger
 * /mangas/adm:
 *   post:
 *     tags: [MangaAdm]
 *     description: register manga
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               idPlugin:
 *                 type: string
 *     responses:
 *       201:
 *         description: Created
 */
mangasAdmController.post(
	'/',
	MangasAdmValidator.registerManga,
	async (req, res) => {
		const { title, idPlugin } = req.body;
		const response = await MangasAdmService.registerManga({ title, idPlugin });

		res.status(201).send(response);
	}
);

/**
 * @swagger
 * /mangas/adm:
 *   get:
 *     tags: [MangaAdm]
 *     description: list mangas
 *     parameters:
 *       - name: title
 *         in: query
 *         required: false
 *         type: string
 *     responses:
 *       200:
 *         description: Returns a list mangas
 */
mangasAdmController.get(
	'/',
	MangasAdmValidator.listMangasRegistered,
	async (req, res) => {
		const { title } = req.query;
		const response = await MangasAdmService.listMangasRegistered({ title });

		res.status(200).send(response);
	}
);

/**
 * @swagger
 * /mangas/adm:
 *   delete:
 *     tags: [MangaAdm]
 *     description: Delete manga
 *     parameters:
 *       - name: title
 *         in: query
 *         required: true
 *         type: string
 *     responses:
 *       200:
 *         description:
 */
mangasAdmController.delete(
	'/',
	MangasAdmValidator.listMangasRegistered,
	async (req, res) => {
		const { title } = req.query;
		await MangasAdmService.deleteManga({ title });

		res.status(200).send();
	}
);

/**
 * @swagger
 * /mangas/adm/cookie:
 *   post:
 *     tags: [MangaAdm]
 *     description: list mangas
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cookie:
 *                 type: string
 *               userAgent:
 *                 type: string
 *               idPlugin:
 *                 type: string
 *     responses:
 *       201:
 *         description: Created
 */
mangasAdmController.post(
	'/cookie',
	MangasAdmValidator.registerCookie,
	async (req, res) => {
		const { cookie, idPlugin, userAgent } = req.body;
		const response = await MangasAdmService.registerCookie({
			cookie,
			idPlugin,
			userAgent
		});

		res.status(201).send(response);
	}
);

/**
 * @swagger
 * /mangas/adm/credentials:
 *   post:
 *     tags: [MangaAdm]
 *     description: list mangas
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               login:
 *                 type: string
 *               password:
 *                 type: string
 *               idPlugin:
 *                 type: string
 *     responses:
 *       201:
 *         description: Created
 */
mangasAdmController.post(
	'/credentials',
	MangasAdmValidator.registerCredentials,
	async (req, res) => {
		const { login, password, idPlugin } = req.body;
		const response = await MangasAdmService.registerCredentials({
			login,
			password,
			idPlugin
		});

		res.status(201).send(response);
	}
);

/**
 * @swagger
 * /mangas/adm/download-batch:
 *   get:
 *     tags: [MangaAdm]
 *     description: Start downloads
 *     responses:
 *       200:
 *         description: OK
 */
mangasAdmController.get('/download-batch', async (_req, res) => {
	const response = await MangasAdmService.downloadMangasBatch();

	res.status(200).send(response);
});

/**
 * @swagger
 * /mangas/adm/update-mangas:
 *   get:
 *     tags: [MangaAdm]
 *     description: Start update mandas
 *     responses:
 *       200:
 *         description: OK
 */
mangasAdmController.get('/update-mangas', async (_req, res) => {
	const response = await MangasAdmService.updateMangas();

	res.status(200).send(response);
});

/**
 * @swagger
 * /mangas/adm/chapters:
 *   get:
 *     tags: [MangaAdm]
 *     description: list pages mangas and send to queue download
 *     parameters:
 *       - name: title
 *         in: query
 *         required: true
 *         type: string
 *     responses:
 *       200:
 *         description: Returns a list pages
 */
mangasAdmController.get(
	'/chapters',
	MangasAdmValidator.updateMangaChapters,
	async (req, res) => {
		const { title } = req.query;
		const response = await MangasAdmService.updateMangaChapters({
			title: Array.isArray(title) ? title[0] : title
		});

		res.status(200).send(response);
	}
);

/**
 * @swagger
 * /mangas/adm/chapters:
 *   delete:
 *     tags: [MangaAdm]
 *     description: list delete chapter
 *     parameters:
 *       - name: title
 *         in: query
 *         required: true
 *         type: string
 *       - name: volume
 *         in: query
 *         required: true
 *         type: string
 *     responses:
 *       200:
 *         description:
 */
mangasAdmController.delete(
	'/chapters',
	MangasAdmValidator.deleteMangaChapters,
	async (req, res) => {
		const { title, volume } = req.query;
		await MangasAdmService.deleteMangaChapters({
			title,
			volume
		});

		res.status(200).send();
	}
);

/**
 * @swagger
 * /mangas/adm/chapters/pages:
 *   get:
 *     tags: [MangaAdm]
 *     description: list pages mandas and send to queue download
 *     parameters:
 *       - name: idChapterPlugin
 *         in: query
 *         required: true
 *         type: string
 *       - name: pluginId
 *         in: query
 *         required: true
 *         type: string
 *       - name: title
 *         in: query
 *         required: true
 *         type: string
 *       - name: volume
 *         in: query
 *         required: true
 *         type: string
 *       - name: idChapter
 *         in: query
 *         required: true
 *         type: string
 *     responses:
 *       200:
 *         description: Returns a list pages
 */
mangasAdmController.get(
	'/chapters/pages',
	MangasAdmValidator.listPagesAndSend,
	async (req, res) => {
		const { idChapterPlugin, pluginId, title, volume, idChapter } = req.query;
		const response = await MangasAdmService.listPagesAndSend({
			idChapterPlugin,
			pluginId,
			title,
			volume,
			idChapter
		});

		res.status(200).send(response);
	}
);

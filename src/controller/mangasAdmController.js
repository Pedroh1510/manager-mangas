import express, { response } from 'express';
import MangasAdmService from '../model/mangasAdm.js';
import MangasAdmValidator from '../validators/mangasAdmValidator.js';
import MangasService from '../model/mangas.js';

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
 *               titlePlugin:
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
		const { title, idPlugin, titlePlugin } = req.body;
		const response = await MangasAdmService.registerManga({
			title,
			idPlugin,
			titlePlugin
		});

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
mangasAdmController.get('/download-batch', async (req, res) => {
	const response = await MangasAdmService.downloadMangasBatch(req.query.title);

	res.status(200).send(response);
});

/**
 * @swagger
 * /mangas/adm/download:
 *   get:
 *     tags: [MangaAdm]
 *     description: download
 *     responses:
 *       200:
 *         description: OK
 */
mangasAdmController.get('/download', async (req, res) => {
	const response = await MangasAdmService.downloadManga({
		title: req.query.title,
		volume: req.query.volume
	});

	// res.status(200).attachment(`${Date.UTC()}.zip`).
	res.writeHead(200, {
		'Content-Type': 'application/zip',
		'Content-disposition': `attachment; filename=${Date.UTC()}.zip`
	});
	response.pipe(res);
});

/**
 * @swagger
 * /mangas/adm/update-mangas/batch:
 *   get:
 *     tags: [MangaAdm]
 *     description: Start update mandas
 *     parameters:
 *       - name: idPlugin
 *         in: query
 *         required: true
 *         type: string
 *     responses:
 *       200:
 *         description: OK
 */
mangasAdmController.get('/update-mangas/batch', async (req, res) => {
	const response = await MangasAdmService.updateMangasBatch(req.query);

	res.status(200).send(response);
});

/**
 * @swagger
 * /mangas/adm/update-mangas:
 *   get:
 *     tags: [MangaAdm]
 *     description: Start update mandas
 *     parameters:
 *       - name: idPlugin
 *         in: query
 *         required: false
 *         type: string
 *     responses:
 *       200:
 *         description: OK
 */
mangasAdmController.get('/update-mangas', async (req, res) => {
	const response = await MangasAdmService.updateMangas(req.query);

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

/**
 * @swagger
 * /mangas/adm/chapters/missing:
 *   get:
 *     tags: [MangaAdm]
 *     description: list pages mandas and send to queue download
 *     parameters:
 *       - name: pluginId
 *         in: query
 *         required: true
 *         type: string
 *       - name: title
 *         in: query
 *         required: true
 *         type: string
 *     responses:
 *       200:
 *         description: Returns a list pages
 */
mangasAdmController.get('/chapters/missing', async (req, res) => {
	const { title, pluginId } = req.query;
	const manga = await MangasService.getMangaFromPlugin({
		idPlugin: pluginId,
		title
	});
	const response = await MangasAdmService.listChaptersMissing({
		mangaByPlugin: [{ title, idPlugin: pluginId, idManga: manga.id }]
	});

	res.status(200).send(response);
});

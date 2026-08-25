import express from 'express';
import MangaAdminService from '../service/mangaAdmin.js';
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
 *     description: Register a new canonical manga (no connector link yet)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *     responses:
 *       201:
 *         description: Created
 */
mangasAdmController.post(
	'/',
	MangasAdmValidator.createManga,
	async (req, res) => {
		const { title } = req.body;
		const response = await MangaAdminService.createManga({ title });
		res.status(201).send(response);
	},
);

/**
 * @swagger
 * /mangas/adm:
 *   get:
 *     tags: [MangaAdm]
 *     description: List registered (non-deleted) mangas
 *     parameters:
 *       - name: title
 *         in: query
 *         required: false
 *         type: string
 *     responses:
 *       200:
 *         description: Returns a list of mangas
 */
mangasAdmController.get(
	'/',
	MangasAdmValidator.listMangasRegistered,
	async (req, res) => {
		const { title } = req.query;
		const response = await MangaAdminService.listMangasRegistered({ title });
		res.status(200).send(response);
	},
);

/**
 * @swagger
 * /mangas/adm/{idManga}:
 *   delete:
 *     tags: [MangaAdm]
 *     description: Soft-delete a manga, deactivate its connector links, delete its chapters, and remove its downloaded files
 *     parameters:
 *       - name: idManga
 *         in: path
 *         required: true
 *         type: integer
 *     responses:
 *       200:
 *         description: OK
 */
mangasAdmController.delete(
	'/:idManga',
	MangasAdmValidator.idMangaParam,
	async (req, res) => {
		const idManga = Number(req.params.idManga);
		await MangaAdminService.deleteManga({ idManga });
		res.status(200).send();
	},
);

/**
 * @swagger
 * /mangas/adm/{idManga}/connectors:
 *   post:
 *     tags: [MangaAdm]
 *     description: Link a connector to a manga. idMangaPlugin and titlePlugin come from a prior GET /mangas/{idPlugin}?title= search
 *     parameters:
 *       - name: idManga
 *         in: path
 *         required: true
 *         type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               idPlugin:
 *                 type: string
 *               idMangaPlugin:
 *                 type: string
 *               titlePlugin:
 *                 type: string
 *     responses:
 *       201:
 *         description: Created
 */
mangasAdmController.post(
	'/:idManga/connectors',
	MangasAdmValidator.linkConnector,
	async (req, res) => {
		const idManga = Number(req.params.idManga);
		const { idPlugin, idMangaPlugin, titlePlugin } = req.body;
		const response = await MangaAdminService.linkConnector({
			idManga,
			idPlugin,
			idMangaPlugin,
			titlePlugin,
		});
		res.status(201).send(response);
	},
);

/**
 * @swagger
 * /mangas/adm/{idManga}/connectors:
 *   get:
 *     tags: [MangaAdm]
 *     description: List all connector links for a manga, including isActive and titlePlugin per connector
 *     parameters:
 *       - name: idManga
 *         in: path
 *         required: true
 *         type: integer
 *     responses:
 *       200:
 *         description: Returns a list of connector links
 */
mangasAdmController.get(
	'/:idManga/connectors',
	MangasAdmValidator.idMangaParam,
	async (req, res) => {
		const idManga = Number(req.params.idManga);
		const response = await MangaAdminService.listConnectors({ idManga });
		res.status(200).send(response);
	},
);

/**
 * @swagger
 * /mangas/adm/{idManga}/connectors/{idPlugin}:
 *   patch:
 *     tags: [MangaAdm]
 *     description: Enable or disable a manga's connector link (reversible). Disabling stops batch auto-update, manual update-mangas, and discovery of new chapters for this connector
 *     parameters:
 *       - name: idManga
 *         in: path
 *         required: true
 *         type: integer
 *       - name: idPlugin
 *         in: path
 *         required: true
 *         type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Returns the updated connector link
 */
mangasAdmController.patch(
	'/:idManga/connectors/:idPlugin',
	MangasAdmValidator.setConnectorActive,
	async (req, res) => {
		const idManga = Number(req.params.idManga);
		const { idPlugin } = req.params;
		const { isActive } = req.body;
		const response = await MangaAdminService.setConnectorActive({
			idManga,
			idPlugin,
			isActive,
		});
		res.status(200).send(response);
	},
);

/**
 * @swagger
 * /mangas/adm/cookie:
 *   post:
 *     tags: [MangaAdm]
 *     description: Set the cookie (and optionally user agent) used for every manga fetched through a connector
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
		const response = await MangaAdminService.registerCookie({
			cookie,
			idPlugin,
			userAgent,
		});
		res.status(201).send(response);
	},
);

/**
 * @swagger
 * /mangas/adm/credentials:
 *   post:
 *     tags: [MangaAdm]
 *     description: Set the login credentials used for every manga fetched through a connector
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
		const response = await MangaAdminService.registerCredentials({
			login,
			password,
			idPlugin,
		});
		res.status(201).send(response);
	},
);

/**
 * @swagger
 * /mangas/adm/download-batch:
 *   get:
 *     tags: [MangaAdm]
 *     description: Enqueue background downloads for every chapter not yet downloaded, optionally scoped to one manga
 *     parameters:
 *       - name: idManga
 *         in: query
 *         required: false
 *         type: integer
 *     responses:
 *       200:
 *         description: Returns the total number of chapters enqueued
 */
mangasAdmController.get('/download-batch', async (req, res) => {
	const idManga = req.query.idManga ? Number(req.query.idManga) : undefined;
	const response = await MangaAdminService.downloadMangasBatch({ idManga });
	res.status(200).send(response);
});

/**
 * @swagger
 * /mangas/adm/{idManga}/download:
 *   get:
 *     tags: [MangaAdm]
 *     description: Download a manga's files from disk as a zip, optionally scoped to one volume
 *     parameters:
 *       - name: idManga
 *         in: path
 *         required: true
 *         type: integer
 *       - name: volume
 *         in: query
 *         required: false
 *         type: string
 *     responses:
 *       200:
 *         description: Returns a zip file
 */
mangasAdmController.get(
	'/:idManga/download',
	MangasAdmValidator.downloadManga,
	async (req, res) => {
		const idManga = Number(req.params.idManga);
		const { volume } = req.query;
		const response = await MangaAdminService.downloadManga({ idManga, volume });
		res.writeHead(200, {
			'Content-Type': 'application/zip',
			'Content-disposition': `attachment; filename=${Date.UTC()}.zip`,
		});
		response.pipe(res);
	},
);

/**
 * @swagger
 * /mangas/adm/update-mangas/batch:
 *   get:
 *     tags: [MangaAdm]
 *     description: Synchronously fetch and enqueue downloads for up to 5 missing chapters per active connector link, optionally scoped to one connector
 *     parameters:
 *       - name: idPlugin
 *         in: query
 *         required: false
 *         type: string
 *     responses:
 *       200:
 *         description: Returns the number of chapters enqueued per idManga
 */
mangasAdmController.get('/update-mangas/batch', async (req, res) => {
	const response = await MangaAdminService.updateMangasBatch({
		idPlugin: req.query.idPlugin,
	});
	res.status(200).send(response);
});

/**
 * @swagger
 * /mangas/adm/update-mangas:
 *   get:
 *     tags: [MangaAdm]
 *     description: Enqueue a background chapter-update job for every active connector link, optionally scoped to one connector
 *     parameters:
 *       - name: idPlugin
 *         in: query
 *         required: false
 *         type: string
 *     responses:
 *       200:
 *         description: Returns the total number of mangas enqueued
 */
mangasAdmController.get('/update-mangas', async (req, res) => {
	const response = await MangaAdminService.updateMangas({
		idPlugin: req.query.idPlugin,
	});
	res.status(200).send(response);
});

/**
 * @swagger
 * /mangas/adm/{idManga}/chapters:
 *   get:
 *     tags: [MangaAdm]
 *     description: List all known chapters for a manga, across every connector
 *     parameters:
 *       - name: idManga
 *         in: path
 *         required: true
 *         type: integer
 *     responses:
 *       200:
 *         description: Returns a list of chapters
 */
mangasAdmController.get(
	'/:idManga/chapters',
	MangasAdmValidator.idMangaParam,
	async (req, res) => {
		const idManga = Number(req.params.idManga);
		const response = await MangaAdminService.listChapters({ idManga });
		res.status(200).send(response);
	},
);

/**
 * @swagger
 * /mangas/adm/{idManga}/chapters/{idChapter}:
 *   delete:
 *     tags: [MangaAdm]
 *     description: Delete a chapter row and its downloaded file
 *     parameters:
 *       - name: idManga
 *         in: path
 *         required: true
 *         type: integer
 *       - name: idChapter
 *         in: path
 *         required: true
 *         type: integer
 *     responses:
 *       200:
 *         description: OK
 */
mangasAdmController.delete(
	'/:idManga/chapters/:idChapter',
	MangasAdmValidator.chapterParams,
	async (req, res) => {
		const idManga = Number(req.params.idManga);
		const idChapter = Number(req.params.idChapter);
		await MangaAdminService.deleteChapter({ idManga, idChapter });
		res.status(200).send();
	},
);

/**
 * @swagger
 * /mangas/adm/{idManga}/chapters/{idChapter}/pages:
 *   get:
 *     tags: [MangaAdm]
 *     description: Fetch a known chapter's pages from its connector and enqueue it for download
 *     parameters:
 *       - name: idManga
 *         in: path
 *         required: true
 *         type: integer
 *       - name: idChapter
 *         in: path
 *         required: true
 *         type: integer
 *     responses:
 *       200:
 *         description: OK
 */
mangasAdmController.get(
	'/:idManga/chapters/:idChapter/pages',
	MangasAdmValidator.chapterParams,
	async (req, res) => {
		const idChapter = Number(req.params.idChapter);
		const response = await MangaAdminService.listPagesAndSend({ idChapter });
		res.status(200).send(response);
	},
);

/**
 * @swagger
 * /mangas/adm/{idManga}/chapters/missing:
 *   get:
 *     tags: [MangaAdm]
 *     description: List chapters known to the manga's active connectors but not yet registered in the database
 *     parameters:
 *       - name: idManga
 *         in: path
 *         required: true
 *         type: integer
 *     responses:
 *       200:
 *         description: Returns a list of missing chapters
 */
mangasAdmController.get(
	'/:idManga/chapters/missing',
	MangasAdmValidator.idMangaParam,
	async (req, res) => {
		const idManga = Number(req.params.idManga);
		const response = await MangaAdminService.listChaptersMissing({ idManga });
		res.status(200).send(response);
	},
);

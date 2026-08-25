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

mangasAdmController.post(
	'/',
	MangasAdmValidator.createManga,
	async (req, res) => {
		const { title } = req.body;
		const response = await MangaAdminService.createManga({ title });
		res.status(201).send(response);
	},
);

mangasAdmController.get(
	'/',
	MangasAdmValidator.listMangasRegistered,
	async (req, res) => {
		const { title } = req.query;
		const response = await MangaAdminService.listMangasRegistered({ title });
		res.status(200).send(response);
	},
);

mangasAdmController.delete(
	'/:idManga',
	MangasAdmValidator.idMangaParam,
	async (req, res) => {
		const idManga = Number(req.params.idManga);
		await MangaAdminService.deleteManga({ idManga });
		res.status(200).send();
	},
);

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

mangasAdmController.get(
	'/:idManga/connectors',
	MangasAdmValidator.idMangaParam,
	async (req, res) => {
		const idManga = Number(req.params.idManga);
		const response = await MangaAdminService.listConnectors({ idManga });
		res.status(200).send(response);
	},
);

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

mangasAdmController.get('/download-batch', async (req, res) => {
	const idManga = req.query.idManga ? Number(req.query.idManga) : undefined;
	const response = await MangaAdminService.downloadMangasBatch({ idManga });
	res.status(200).send(response);
});

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

mangasAdmController.get('/update-mangas/batch', async (req, res) => {
	const response = await MangaAdminService.updateMangasBatch({
		idPlugin: req.query.idPlugin,
	});
	res.status(200).send(response);
});

mangasAdmController.get('/update-mangas', async (req, res) => {
	const response = await MangaAdminService.updateMangas({
		idPlugin: req.query.idPlugin,
	});
	res.status(200).send(response);
});

mangasAdmController.get(
	'/:idManga/chapters',
	MangasAdmValidator.idMangaParam,
	async (req, res) => {
		const idManga = Number(req.params.idManga);
		const response = await MangaAdminService.listChapters({ idManga });
		res.status(200).send(response);
	},
);

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

mangasAdmController.get(
	'/:idManga/chapters/:idChapter/pages',
	MangasAdmValidator.chapterParams,
	async (req, res) => {
		const idChapter = Number(req.params.idChapter);
		const response = await MangaAdminService.listPagesAndSend({ idChapter });
		res.status(200).send(response);
	},
);

mangasAdmController.get(
	'/:idManga/chapters/missing',
	MangasAdmValidator.idMangaParam,
	async (req, res) => {
		const idManga = Number(req.params.idManga);
		const response = await MangaAdminService.listChaptersMissing({ idManga });
		res.status(200).send(response);
	},
);

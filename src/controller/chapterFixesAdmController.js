import express from 'express';
import ChapterFixes from '../service/chapterFixes.js';
import ChapterFixesValidator from '../validators/chapterFixesValidator.js';

const chapterFixesAdmController = express.Router();
export default chapterFixesAdmController;

const chapterIds = (params) => ({
	idManga: Number(params.idManga),
	idChapter: Number(params.idChapter),
});

/**
 * @swagger
 * /mangas/adm/{idManga}/chapters/{idChapter}/sources:
 *   get:
 *     tags: [MangaAdm]
 *     description: Ask every active connector link whether it lists the chapter's volume
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
 *         description: Returns a list of sources (status available, missing, blocked, disabled or failed)
 *       404:
 *         description: Chapter not found in this manga
 */
chapterFixesAdmController.get(
	'/:idManga/chapters/:idChapter/sources',
	ChapterFixesValidator.chapterParams,
	async (req, res) => {
		const response = await ChapterFixes.listSources(chapterIds(req.params));
		res.status(200).send(response);
	},
);

/**
 * @swagger
 * /mangas/adm/{idManga}/chapters/{idChapter}/replace:
 *   post:
 *     tags: [MangaAdm]
 *     description: Replace the chapter's file and row with the same volume from another active link
 *     parameters:
 *       - name: idManga
 *         in: path
 *         required: true
 *         type: integer
 *       - name: idChapter
 *         in: path
 *         required: true
 *         type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idMangaConnector, idChapterPlugin]
 *             properties:
 *               idMangaConnector:
 *                 type: integer
 *               idChapterPlugin:
 *                 type: string
 *     responses:
 *       200:
 *         description: Returns { idChapter }
 *       400:
 *         description: Link not active in this manga, or volume differs
 *       404:
 *         description: Chapter not found in this manga
 *       409:
 *         description: Connector disabled, pair blocked, or chapter already stored
 */
chapterFixesAdmController.post(
	'/:idManga/chapters/:idChapter/replace',
	ChapterFixesValidator.replaceSource,
	async (req, res) => {
		const { idMangaConnector, idChapterPlugin } = req.body;
		const response = await ChapterFixes.replaceSource({
			...chapterIds(req.params),
			idMangaConnector,
			idChapterPlugin,
		});
		res.status(200).send(response);
	},
);

/**
 * @swagger
 * /mangas/adm/{idManga}/chapters/{idChapter}/block:
 *   post:
 *     tags: [MangaAdm]
 *     description: Block the chapter's (link, chapter) pair so discovery skips it, and delete its row and file
 *     parameters:
 *       - name: idManga
 *         in: path
 *         required: true
 *         type: integer
 *       - name: idChapter
 *         in: path
 *         required: true
 *         type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 maxLength: 200
 *                 description: Empty string is stored as null
 *     responses:
 *       201:
 *         description: Returns { idBlockedChapter }
 *       400:
 *         description: Invalid reason
 *       404:
 *         description: Chapter not found in this manga
 */
chapterFixesAdmController.post(
	'/:idManga/chapters/:idChapter/block',
	ChapterFixesValidator.blockChapter,
	async (req, res) => {
		const reason = req.body?.reason || null;
		const response = await ChapterFixes.blockChapter({
			...chapterIds(req.params),
			reason,
		});
		res.status(201).send(response);
	},
);

/**
 * @swagger
 * /mangas/adm/{idManga}/blocked-chapters:
 *   get:
 *     tags: [MangaAdm]
 *     description: List the manga's blocked chapters
 *     parameters:
 *       - name: idManga
 *         in: path
 *         required: true
 *         type: integer
 *     responses:
 *       200:
 *         description: Returns a list of blocked chapters
 */
chapterFixesAdmController.get(
	'/:idManga/blocked-chapters',
	ChapterFixesValidator.mangaParams,
	async (req, res) => {
		const idManga = Number(req.params.idManga);
		res.status(200).send(await ChapterFixes.listBlocked({ idManga }));
	},
);

/**
 * @swagger
 * /mangas/adm/{idManga}/blocked-chapters/{idBlockedChapter}:
 *   delete:
 *     tags: [MangaAdm]
 *     description: Unblock a chapter so discovery may record it again
 *     parameters:
 *       - name: idManga
 *         in: path
 *         required: true
 *         type: integer
 *       - name: idBlockedChapter
 *         in: path
 *         required: true
 *         type: integer
 *     responses:
 *       200:
 *         description: Unblocked
 *       404:
 *         description: Block not found in this manga
 */
chapterFixesAdmController.delete(
	'/:idManga/blocked-chapters/:idBlockedChapter',
	ChapterFixesValidator.unblockParams,
	async (req, res) => {
		const idManga = Number(req.params.idManga);
		const idBlockedChapter = Number(req.params.idBlockedChapter);
		await ChapterFixes.unblock({ idManga, idBlockedChapter });
		res.sendStatus(200);
	},
);

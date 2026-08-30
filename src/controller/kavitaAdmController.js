import express from 'express';
import KavitaCleanupService from '../service/kavita/cleanupReadChapters.js';
import MangasAdmValidator from '../validators/mangasAdmValidator.js';

const kavitaAdmController = express();
export default kavitaAdmController;

/**
 * @swagger
 * /mangas/adm/kavita/cleanup:
 *   post:
 *     tags: [MangaAdm]
 *     description: Delete on-disk chapters fully read in Kavita (never partial), always keeping each manga's highest-numbered chapter. Only runs if the Kavita connection (health + auth) succeeds; never writes to any database.
 *     parameters:
 *       - name: idManga
 *         in: query
 *         required: false
 *         type: integer
 *     responses:
 *       200:
 *         description: Returns totalDeleted and mangasProcessed
 */
kavitaAdmController.post(
	'/cleanup',
	MangasAdmValidator.cleanupQuery,
	async (req, res) => {
		const idManga = req.query.idManga ? Number(req.query.idManga) : undefined;
		const response = await KavitaCleanupService.cleanupReadChapters({
			idManga,
		});
		res.status(200).send(response);
	},
);

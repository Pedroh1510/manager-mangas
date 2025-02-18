import express from 'express';
import mangasController from './controller/mangasController.js';
import MigrationsService from './model/migrations.js';
import StatusService from './model/status.js';
import routerDoc from './infra/swagger.js';

const router = express();
export default router;
/**
 * @swagger
 * tags:
 *   name: Migrations
 *   description: Migrations
 */

/**
 * @swagger
 * tags:
 *   name: Status
 *   description: Status
 */

router.use(routerDoc);
router.use('/mangas', mangasController);

/**
 * @swagger
 * /status:
 *   get:
 *     tags: [Status]
 *     responses:
 *       200:
 *         description: Returns a status
 */
router.get('/status', async (_, res) => {
	const status = await StatusService.getDatabaseStatus();
	res.status(200).json(status);
});

/**
 * @swagger
 * /migrations:
 *   get:
 *     tags: [Migrations]
 *     responses:
 *       200:
 *         description: Returns a list pending migrations
 */
router.get('/migrations', async (_, res) => {
	const migrations = await MigrationsService.dryRun();
	res.status(200).json(migrations);
});

/**
 * @swagger
 * /migrations:
 *   post:
 *     tags: [Migrations]
 *     responses:
 *       200:
 *         description: Returns a list migrations applied
 */
router.post('/migrations', async (_, res) => {
	const migrations = await MigrationsService.run();
	res.status(201).json(migrations);
});

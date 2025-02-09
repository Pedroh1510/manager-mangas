import express from 'express';
import mangasController from './controller/mangasController.js';
import MigrationsService from './model/migrations.js';
import StatusService from './model/status.js';
import routerDoc from './infra/swagger.js';

const router = express();
export default router;

router.use(routerDoc);
router.use('/mangas', mangasController);

router.get('/status', async (_, res) => {
	const status = await StatusService.getDatabaseStatus();
	res.status(200).json(status);
});

router.get('/migrations', async (_, res) => {
	const migrations = await MigrationsService.dryRun();
	res.status(200).json(migrations);
});
router.post('/migrations', async (_, res) => {
	const migrations = await MigrationsService.run();
	res.status(201).json(migrations);
});

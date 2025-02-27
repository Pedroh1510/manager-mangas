import { beforeAll, describe, expect, test } from 'vitest';
import api from '../../../../infra/api.js';
import orchestrator from '../../../orchestrator.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
	await orchestrator.seedDatabase();
});

describe('GET /mangas/adm', () => {
	test('OK', async () => {
		const title = 'Black Clover';
		const response = await api.get('/mangas/adm', {
			params: { title }
		});
		expect(response.status).toEqual(200);
		expect(response.data).toEqual([
			{
				idManga: 1,
				idPlugin: 'Leitordemanga',
				title: 'Black Clover',
				titleFolder: 'Black Clover'
			}
		]);
	});
});

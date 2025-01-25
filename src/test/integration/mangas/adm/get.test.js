import { beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../../orchestrator.js';
import api from '../../../../infra/api.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
	await orchestrator.seedDatabase();
});

describe('GET /mangas/adm', () => {
	test('OK', async () => {
		const title = 'Black Clover';
		const response = await api.get(`/mangas/adm`, {
			params: { title }
		});
		expect(response.status).toEqual(200);
		expect(response.data).toEqual([
			{
				idManga: 1,
				idPlugin: 'leitordemanga',
				title: 'Black Clover'
			}
		]);
	});
});

import { beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../../../orchestrator.js';
import api from '../../../../../infra/api.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
	await orchestrator.seedDatabase();
});

describe('GET /mangas/adm/update-mangas', () => {
	test('OK', async () => {
		const response = await api.get(`/mangas/adm/update-mangas`);
		expect(response.status).toBe(200);

		expect(response.data).toStrictEqual({
			totalUpdated: 2
		});
	});
});

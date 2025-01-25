import { beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../../../orchestrator.js';
import api from '../../../../../infra/api.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
	await orchestrator.seedDatabase();
});

describe('GET /mangas/adm/chapters', () => {
	test('Should return status code 200.', async () => {
		const title = 'Black Clover';
		const response = await api.get(
			`${orchestrator.webServiceAddress}/mangas/adm/chapters`,
			{
				params: {
					title
				}
			}
		);
		expect(response.status).toBe(200);
		expect(response.data.length).toBeGreaterThanOrEqual(373);
	});
});

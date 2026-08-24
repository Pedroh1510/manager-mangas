import { beforeAll, describe, expect, test } from 'vitest';
import api from '../../../../../infra/api.js';
import orchestrator from '../../../../orchestrator.js';

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
					title,
				},
			},
		);
		expect(response.status).toBe(200);
		// TestFixtureConnector's catalog only exposes 2 chapters (ch-376,
		// ch-375) for this manga — deterministic, unlike the old real-site
		// scrape this test used to depend on.
		expect(response.data.length).toBe(2);
	});
});

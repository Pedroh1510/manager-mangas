import { beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../../../../orchestrator.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
	await orchestrator.seedDatabase();
});

describe('POST /mangas/adm/:title/chapters', () => {
	test('Should return status code 200.', async () => {
		const title = 'Black Clover';
		const response = await fetch(
			`${orchestrator.webServiceAddress}/mangas/adm/${title}/chapters`,
			{
				method: 'POST'
			}
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toHaveLength(373);
	});
});

import { beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../../orchestrator.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
	await orchestrator.seedDatabase();
});

describe('GET /mangas/adm/:title', () => {
	test('OK', async () => {
		const title = 'Black Clover';
		const response = await fetch(
			`${orchestrator.webServiceAddress}/mangas/adm/${title}`,
			{
				method: 'GET'
			}
		);
		expect(response.status).toEqual(200);
		const body = await response.json();
		expect(body).toEqual([
			{
				idManga: 1,
				idPlugin: 'leitordemanga',
				title: 'Black Clover'
			}
		]);
	});
});

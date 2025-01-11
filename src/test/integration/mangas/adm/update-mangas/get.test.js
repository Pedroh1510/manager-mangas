import { beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../../../orchestrator.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
	await orchestrator.seedDatabase();
});

describe('GET /mangas/adm/update-mangas', () => {
	test('OK', async () => {
		const response = await fetch(
			`${orchestrator.webServiceAddress}/mangas/adm/update-mangas`
		);
		expect(response.status).toBe(200);
		const body = await response.json();

		expect(body).toStrictEqual({
			totalUpdated: 1
		});
	});
	test('empty', async () => {
		const response = await fetch(
			`${orchestrator.webServiceAddress}/mangas/adm/update-mangas`
		);
		expect(response.status).toBe(200);
		const body = await response.json();

		expect(body).toStrictEqual({
			totalUpdated: 0
		});
	});
});

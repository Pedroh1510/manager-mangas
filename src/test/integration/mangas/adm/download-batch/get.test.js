import { beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../../../orchestrator.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
	await orchestrator.seedDatabase();
});

describe('GET /mangas/adm/download-batch', () => {
	test('OK', async () => {
		const response = await fetch(
			`${orchestrator.webServiceAddress}/mangas/adm/download-batch`
		);
		expect(response.status).toBe(200);
		const body = await response.json();

		expect(body).toStrictEqual({
			totalDownloaded: 3
		});
	});
	test('empty', async () => {
		const response = await fetch(
			`${orchestrator.webServiceAddress}/mangas/adm/download-batch`
		);
		expect(response.status).toBe(200);
		const body = await response.json();

		expect(body).toStrictEqual({
			totalDownloaded: 0
		});
	});
});

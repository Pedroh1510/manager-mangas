import { beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../../../orchestrator.js';
import api from '../../../../../infra/api.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
	await orchestrator.seedDatabase();
});

describe('GET /mangas/adm/download-batch', () => {
	test('OK', async () => {
		const response = await api.get(`/mangas/adm/download-batch`);

		expect(response.status).toBe(200);

		expect(response.data).toStrictEqual({
			totalDownloaded: 3
		});
	});
});

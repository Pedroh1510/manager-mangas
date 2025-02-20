import { beforeAll, describe, expect, test } from 'vitest';
import api from '../../../../infra/api.js';
import orchestrator from '../../../orchestrator.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
	await orchestrator.seedDatabase();
	await orchestrator.seedDownload();
});

describe('DELETE /mangas/adm', () => {
	test('OK', async () => {
		const title = 'Black Clover';
		const response = await api.delete('/mangas/adm', {
			params: { title }
		});
		expect(response.status).toEqual(200);
	});
});

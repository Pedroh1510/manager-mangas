import { beforeAll, describe, expect, test } from 'vitest';
import api from '../../../../../infra/api.js';
import orchestrator from '../../../../orchestrator.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
	await orchestrator.seedDatabase();
	await orchestrator.seedDownload();
});

describe('DELETE /mangas/adm/chapters', () => {
	test('OK.', async () => {
		const title = 'Black Clover';
		const volume = 376;
		const response = await api.delete('/mangas/adm/chapters', {
			params: {
				title,
				volume
			}
		});
		expect(response.status).toBe(200);
	});
});

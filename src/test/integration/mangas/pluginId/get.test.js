import { beforeAll, describe, expect, test } from 'vitest';
import api from '../../../../infra/api.js';
import orchestrator from '../../../orchestrator.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.runMigrations();
});

describe('GET /mangas/:pluginId', () => {
	describe('HiperCool', () => {
		test('', async () => {
			const response = await api('/mangas/HiperCool/').then(
				({ status, data }) => ({ status, data })
			);
			expect(response.status).toEqual(200);
			expect(response.data.length).toBeGreaterThanOrEqual(13620);
		});
	});
});

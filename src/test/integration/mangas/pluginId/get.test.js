import { beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../../orchestrator.js';
import CONFIG_ENV from '../../../../infra/env.js';
import api from '../../../../infra/api.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.runMigrations();
});

describe.concurrent('Manga', () => {
	describe('HiperCool', () => {
		test('', async () => {
			const response = await api(`/mangas/HiperCool/`).then(
				({ status, data }) => ({ status, data })
			);
			expect(response.status).toEqual(200);
			expect(response.data.length).toBeGreaterThanOrEqual(13620);
		});
	});
});

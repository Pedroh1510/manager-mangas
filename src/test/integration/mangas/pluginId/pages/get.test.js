import { beforeAll, describe, expect, test } from 'vitest';
import api from '../../../../../infra/api.js';
import CONFIG_ENV from '../../../../../infra/env.js';
import orchestrator from '../../../../orchestrator.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
});

describe('GET /mangas/:pluginId/pages', () => {
	describe('Leitordemanga', () => {
		test('', async () => {
			const response = await fetch(
				`${CONFIG_ENV.URL}/mangas/Leitordemanga/pages?chapterId=/ler-manga/black-clover/portugues-pt-br/capitulo-376`
			);
			expect(response.status).toEqual(200);
			const body = await response.json();

			expect(body.length).toBeGreaterThanOrEqual(18);
		});
	});
	describe('HiperCool', () => {
		test('', async () => {
			const response = await api(
				`${CONFIG_ENV.URL}/mangas/HiperCool/pages?chapterId=/manga/regressed-warriors-female-dominance-diary/capitulo-01/`
			);
			expect(response.status).toEqual(200);
			expect(response.data.length).toEqual(38);
		});
	});
});

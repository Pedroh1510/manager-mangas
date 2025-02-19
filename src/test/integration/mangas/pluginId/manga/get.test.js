import { beforeAll, describe, expect, test } from 'vitest';
import api from '../../../../../infra/api.js';
import orchestrator from '../../../../orchestrator.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.runMigrations();
});

describe('GET /mangas/:pluginId/manga', () => {
	describe('Leitordemanga', () => {
		test('', async () => {
			const response = await api.get(
				'/mangas/Leitordemanga/manga?mangaId=/ler-manga/black-clover/'
			);
			expect(response.status).toEqual(200);
			expect(response.data.length).toBeGreaterThanOrEqual(378);
		});
	});
	describe('HiperCool', () => {
		test('', async () => {
			const response = await api.get(
				'/mangas/HiperCool/manga?mangaId=/manga/regressed-warriors-female-dominance-diary/'
			);
			expect(response.status).toEqual(200);
			expect(response.data.length).toBeGreaterThanOrEqual(54);
		});
	});
});

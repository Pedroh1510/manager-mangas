import { beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../../../orchestrator.js';
import CONFIG_ENV from '../../../../../infra/env.js';
import api from '../../../../../infra/api.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
});

describe.concurrent('Manga', () => {
	describe('Leitordemanga', () => {
		test('', async () => {
			const response = await api.get(
				`/mangas/Leitordemanga/manga?mangaId=/ler-manga/black-clover/`
			);
			expect(response.status).toEqual(200);
			expect(response.data.length).toBeGreaterThanOrEqual(378);
		});
	});
	describe('HiperCool', () => {
		test('', async () => {
			const response = await api.get(
				`/mangas/HiperCool/manga?mangaId=/manga/regressed-warriors-female-dominance-diary/`
			);
			expect(response.status).toEqual(200);
			expect(response.data.length).toBeGreaterThanOrEqual(54);
		});
	});
});

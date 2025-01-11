import { beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../../../orchestrator.js';
import CONFIG_ENV from '../../../../../infra/env.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
});

describe.concurrent('Manga', () => {
	describe('Leitordemanga', () => {
		test('', async () => {
			const response = await fetch(
				`${CONFIG_ENV.URL}/mangas/Leitordemanga/manga?mangaId=/ler-manga/black-clover/`
			);
			expect(response.status).toEqual(200);
			const body = await response.json();
			expect(body).toHaveLength(378);
		});
	});
	describe('HiperCool', () => {
		test('', async () => {
			const response = await fetch(
				`${CONFIG_ENV.URL}/mangas/HiperCool/manga?mangaId=/manga/regressed-warriors-female-dominance-diary/`
			);
			expect(response.status).toEqual(200);
			const body = await response.json();
			expect(body).toHaveLength(50);
		});
	});
	describe('seitacelestial', () => {
		test('', async () => {
			const response = await fetch(
				`${CONFIG_ENV.URL}/mangas/seitacelestial/manga?mangaId=/comics/919933087/`
			);
			expect(response.status).toEqual(200);
			const body = await response.json();
			expect(body).toHaveLength(81);
		});
	});
});

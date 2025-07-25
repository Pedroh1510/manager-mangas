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

	describe('MangaLivreTv', () => {
		test('', async () => {
			const response = await api.get(
				'/mangas/MangaLivreTv/manga?mangaId=/manga/live-dungeon/'
				// '/mangas/MangaLivreTv/manga?mangaId=/manga/00-day-of-summer-holiday/'
			);
			expect(response.status).toEqual(200);
			expect(response.data.length).toBeGreaterThanOrEqual(54);
			console.log(response.data);
		});
	});

	describe('YomuComics', () => {
		test('', async () => {
			const response = await api.get('/mangas/YomuComics/manga', {
				params: {
					mangaId: '/manga/sobrevivendo-no-jogo-como-um-barbaro/'
				}
			});
			expect(response.status).toEqual(200);
			expect(response.data.length).toBeGreaterThanOrEqual(100);
		});
	});
});

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
	describe('MangaLivreTv', () => {
		test('', async () => {
			const response = await api('/mangas/mangalivretv/').then(
				({ status, data }) => ({ status, data })
			);
			expect(response.status).toEqual(200);
			expect(response.data.length).to.be.above(0);
			console.log(response.data[0]);
		});
	});
	describe('YomuComics', () => {
		test('', async () => {
			const response = await api('/mangas/yomucomics', {
				params: {
					title: 'Sobrevivendo no Jogo Como um Bárbaro'
				}
			}).then(({ status, data }) => ({ status, data }));
			expect(response.status).toEqual(200);
			expect(response.data.length).toEqual(1);
			expect(response.data).toEqual([
				{
					id: '/manga/sobrevivendo-no-jogo-como-um-barbaro/',
					title: 'Sobrevivendo no Jogo Como um Bárbaro'
				}
			]);
		});
	});
});

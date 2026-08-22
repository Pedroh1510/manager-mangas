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
				({ status, data }) => ({ status, data }),
			);
			expect(response.status).toEqual(200);
			expect(response.data.length).toBeGreaterThanOrEqual(13620);
		});
	});
	describe('MangaLivreTv', () => {
		test('', async () => {
			const response = await api('/mangas/mangalivretv/').then(
				({ status, data }) => ({ status, data }),
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
					title: 'Sobrevivendo no Jogo Como um Bárbaro',
				},
			}).then(({ status, data }) => ({ status, data }));
			expect(response.status).toEqual(200);
			expect(response.data.length).toEqual(1);
			expect(response.data).toEqual([
				{
					id: '/manga/sobrevivendo-no-jogo-como-um-barbaro/',
					title: 'Sobrevivendo no Jogo Como um Bárbaro',
				},
			]);
		});
	});
	describe('Mangeek', () => {
		test(
			'',
			async () => {
				const response = await api('/mangas/mangeek/').then(
					({ status, data }) => ({ status, data }),
				);
				expect(response.status).toEqual(200);
				// Conservative lower bound from a full manual crawl on 2026-08-22
				// (42 tags via /discover, 9892 unique manga found) — see
				// docs/manager-mangas/mangageek/findings.md. The live catalog only
				// grows over time; this floor should stay valid.
				expect(response.data.length).toBeGreaterThanOrEqual(9880);
			},
			// Cold-cache first hit crawls all ~42 tags live (paginated, rate-limited
			// with a wait between pages inside the connector). Observed ~875s end
			// to end against the live API from this environment, well past the
			// suite's default 500s test timeout — give this one test more room.
			1200000,
		);
	});
});

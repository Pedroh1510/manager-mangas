import { beforeAll, describe, expect, test } from 'vitest';
import api from '../../../../../infra/api.js';
import orchestrator from '../../../../orchestrator.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.runMigrations();
});

describe('GET /mangas/:pluginId/manga', () => {
	describe('test-fixture', () => {
		test('', async () => {
			const response = await api.get('/mangas/test-fixture/manga', {
				params: { mangaId: '1' },
			});
			expect(response.status).toEqual(200);
			expect(response.data).toEqual([
				{ id: 'ch-376', title: 'Capítulo 376', language: 'pt' },
				{ id: 'ch-375', title: 'Capítulo 375', language: 'pt' },
			]);
		});
	});

	describe('Mangeek', () => {
		test('', async () => {
			const response = await api.get(
				'/mangas/mangeek/manga?mangaId=278', // Solo Leveling — stable/popular
			);
			expect(response.status).toEqual(200);
			expect(response.data.length).toBeGreaterThanOrEqual(204);
		});
	});
});

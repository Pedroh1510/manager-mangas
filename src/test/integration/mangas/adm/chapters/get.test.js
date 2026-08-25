import { beforeAll, describe, expect, test } from 'vitest';
import api from '../../../../../infra/api.js';
import orchestrator from '../../../../orchestrator.js';

let blackClover;

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
	({ blackClover } = await orchestrator.seedDatabase());
});

describe('GET /mangas/adm/:idManga/chapters', () => {
	test('Should return status code 200 with the seeded chapters.', async () => {
		const response = await api.get(`/mangas/adm/${blackClover.idManga}/chapters`);
		expect(response.status).toBe(200);
		expect(response.data).toHaveLength(3);
		expect(
			response.data.map((chapter) => Number(chapter.volume)).sort((a, b) => a - b),
		).toEqual([374, 375, 376]);
	});
});

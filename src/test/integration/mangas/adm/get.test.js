import { beforeAll, describe, expect, test } from 'vitest';
import api from '../../../../infra/api.js';
import orchestrator from '../../../orchestrator.js';

let blackClover;

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
	({ blackClover } = await orchestrator.seedDatabase());
});

describe('GET /mangas/adm', () => {
	test('OK', async () => {
		const response = await api.get('/mangas/adm', {
			params: { title: 'Black Clover' },
		});
		expect(response.status).toEqual(200);
		expect(response.data).toEqual([
			{
				idManga: blackClover.idManga,
				title: 'Black Clover',
				createdAt: expect.any(String),
				updatedAt: expect.any(String),
			},
		]);
	});
});

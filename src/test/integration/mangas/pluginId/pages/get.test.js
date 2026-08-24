import { beforeAll, describe, expect, test } from 'vitest';
import api from '../../../../../infra/api.js';
import orchestrator from '../../../../orchestrator.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
});

describe('GET /mangas/:pluginId/pages', () => {
	describe('test-fixture', () => {
		test('', async () => {
			const response = await api('/mangas/test-fixture/pages', {
				params: { chapterId: 'ch-376' },
			});
			expect(response.status).toEqual(200);
			expect(response.data).toEqual([
				'http://test-fixture.invalid/ch-376/1.jpg',
			]);
		});
	});
	describe('Mangeek', () => {
		test('', async () => {
			const response = await api('/mangas/mangeek/pages', {
				params: { chapterId: '171705' },
			});
			expect(response.status).toEqual(200);
			expect(response.data.length).toEqual(16);
		});
	});
});

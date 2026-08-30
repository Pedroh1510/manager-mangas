import { beforeAll, describe, expect, test } from 'vitest';
import api from '../../../../../../infra/api.js';
import orchestrator from '../../../../../orchestrator.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
	await orchestrator.seedDatabase();
});

describe('POST /mangas/adm/kavita/cleanup', () => {
	test('returns zero deletions when the Kavita connection is not usable', async () => {
		const response = await api.post('/mangas/adm/kavita/cleanup');

		expect(response.status).toBe(200);
		expect(response.data).toStrictEqual({
			totalDeleted: 0,
			mangasProcessed: 0,
		});
	});

	test('accepts an optional idManga query param', async () => {
		const response = await api.post('/mangas/adm/kavita/cleanup?idManga=1');

		expect(response.status).toBe(200);
		expect(response.data).toStrictEqual({
			totalDeleted: 0,
			mangasProcessed: 0,
		});
	});

	test('rejects a non-numeric idManga', async () => {
		await expect(
			api.post('/mangas/adm/kavita/cleanup?idManga=not-a-number'),
		).rejects.toMatchObject({ response: { status: 400 } });
	});

	test('accepts an optional title query param', async () => {
		const response = await api.post(
			'/mangas/adm/kavita/cleanup?title=Black+Clover',
		);

		expect(response.status).toBe(200);
		expect(response.data).toStrictEqual({
			totalDeleted: 0,
			mangasProcessed: 0,
		});
	});

	test('rejects idManga and title given together', async () => {
		await expect(
			api.post('/mangas/adm/kavita/cleanup?idManga=1&title=Black+Clover'),
		).rejects.toMatchObject({ response: { status: 400 } });
	});
});

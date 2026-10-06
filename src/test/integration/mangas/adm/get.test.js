import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import api from '../../../../infra/api.js';
import orchestrator from '../../../orchestrator.js';
import AdmUtils from './utils.js';

const admUtils = new AdmUtils();
let blackClover;

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
	({ blackClover } = await orchestrator.seedDatabase());
});

async function createMangaWithLinks(title, links) {
	const { data } = await admUtils.createManga({ title });
	for (const link of links) {
		await admUtils.linkConnector({ idManga: data.idManga, ...link });
	}
	return data.idManga;
}

function findManga(list, idManga) {
	return list.find((manga) => manga.idManga === idManga);
}

describe('GET /mangas/adm', () => {
	test('returns every connector link with its isActive flag', async () => {
		const idManga = await createMangaWithLinks('Dandadan', [
			{
				idPlugin: 'test-fixture',
				idMangaPlugin: 'dan-1',
				titlePlugin: 'Dandadan TF',
			},
			{
				idPlugin: 'mangeek',
				idMangaPlugin: 'dan-2',
				titlePlugin: 'Dandadan MG',
			},
		]);
		await api.patch(`/mangas/adm/${idManga}/connectors/mangeek`, {
			isActive: false,
		});

		const response = await api.get('/mangas/adm');

		expect(response.status).toEqual(200);
		expect(findManga(response.data, idManga).connectors).toEqual([
			{
				idMangaConnector: expect.any(Number),
				idPlugin: 'mangeek',
				titlePlugin: 'Dandadan MG',
				isActive: false,
			},
			{
				idMangaConnector: expect.any(Number),
				idPlugin: 'test-fixture',
				titlePlugin: 'Dandadan TF',
				isActive: true,
			},
		]);
	});

	test('returns an empty connectors array for a manga with no links', async () => {
		const idManga = await createMangaWithLinks('Sem Conector', []);

		const response = await api.get('/mangas/adm');

		expect(findManga(response.data, idManga)).toMatchObject({
			title: 'Sem Conector',
			connectors: [],
		});
	});

	test('orders mangas by title and connectors by idPlugin', async () => {
		const idZeta = await createMangaWithLinks('Zeta', []);
		const idAlpha = await createMangaWithLinks('Alpha', [
			{
				idPlugin: 'test-fixture',
				idMangaPlugin: 'alpha-1',
				titlePlugin: 'Alpha TF',
			},
			{
				idPlugin: 'mangeek',
				idMangaPlugin: 'alpha-2',
				titlePlugin: 'Alpha MG',
			},
		]);

		const response = await api.get('/mangas/adm');

		const ids = response.data.map((manga) => manga.idManga);
		expect(ids.indexOf(idAlpha)).toBeLessThan(ids.indexOf(idZeta));
		expect(
			findManga(response.data, idAlpha).connectors.map((c) => c.idPlugin),
		).toEqual(['mangeek', 'test-fixture']);
	});

	test('filters by title case-insensitively and keeps connectors', async () => {
		const response = await api.get('/mangas/adm', {
			params: { title: 'black clover' },
		});

		expect(response.status).toEqual(200);
		expect(response.data).toEqual([
			{
				idManga: blackClover.idManga,
				title: 'Black Clover',
				createdAt: expect.any(String),
				updatedAt: expect.any(String),
				connectors: [
					{
						idMangaConnector: expect.any(Number),
						idPlugin: 'test-fixture',
						titlePlugin: 'Black Clover',
						isActive: true,
					},
				],
			},
		]);
	});

	test('omits soft-deleted mangas', async () => {
		const idManga = await createMangaWithLinks('Removido', [
			{
				idPlugin: 'test-fixture',
				idMangaPlugin: 'rem-1',
				titlePlugin: 'Removido',
			},
		]);
		await api.delete(`/mangas/adm/${idManga}`);

		const response = await api.get('/mangas/adm');

		expect(findManga(response.data, idManga)).toBeUndefined();
	});

	test('responds 400 when title is not a string', async () => {
		const response = await api
			.get('/mangas/adm?title[]=a')
			.catch((error) => error.response);

		expect(response.status).toEqual(400);
	});
});

describe('GET /mangas/adm without schema', () => {
	afterAll(async () => {
		await orchestrator.runMigrations();
	});

	test('responds 500 when the database query fails', async () => {
		await orchestrator.clearDatabase();

		const response = await api
			.get('/mangas/adm')
			.catch((error) => error.response);

		expect(response.status).toEqual(500);
	});
});

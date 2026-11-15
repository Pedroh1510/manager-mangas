import { beforeAll, describe, expect, test } from 'vitest';
import database from '../../../../infra/database.js';
import orchestrator from '../../../orchestrator.js';
import { normalizeTitle } from '../../../../service/coverSuggestions/titleSimilarity.js';
import CONFIG_ENV from '../../../../infra/env.js';
import AdmUtils from './utils.js';

const admUtils = new AdmUtils();

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
});

async function patchAltTitles(idManga, body) {
	const response = await fetch(`${CONFIG_ENV.URL}/mangas/adm/${idManga}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
	return { status: response.status, data: await response.json() };
}

async function createManga(title) {
	const { data } = await admUtils.createManga({ title });
	return data.idManga;
}

async function storedTitles(idManga) {
	const { rows } = await database.query({
		text: `SELECT "title", "altTitles", "searchTitles" FROM "mangas" WHERE "idManga" = $1`,
		values: [idManga],
	});
	return rows[0];
}

describe('PATCH /mangas/adm/:idManga', () => {
	test('replaces altTitles trimmed and deduplicated', async () => {
		const idManga = await createManga('Solo Leveling');

		const response = await patchAltTitles(idManga, {
			altTitles: ['Upando Sozinho', ' upando  sozinho ', 'Solo Leveling'],
		});

		expect(response.status).toBe(200);
		expect(response.data).toEqual({
			idManga,
			title: 'Solo Leveling',
			altTitles: ['Upando Sozinho'],
		});
	});

	test('rejects invalid altTitles with 400', async () => {
		const idManga = await createManga('Invalid Body');
		const invalidBodies = [
			{},
			{ altTitles: 'x' },
			{ altTitles: [1] },
			{ altTitles: ['  '] },
			{ altTitles: Array.from({ length: 51 }, (_, i) => `Title ${i}`) },
			{ altTitles: ['a'.repeat(256)] },
		];

		for (const body of invalidBodies) {
			const response = await patchAltTitles(idManga, body);
			expect(response.status, JSON.stringify(body)).toBe(400);
			// AC 15: the message cites what came in and the expected shape.
			expect(response.data.message).toMatch(/received/);
			expect(response.data.message).toMatch(/expected/);
		}
	});

	test('accepts the altTitles bounds', async () => {
		const idManga = await createManga('Bounds');
		const fifty = Array.from({ length: 50 }, (_, i) => `Title ${i}`);

		const many = await patchAltTitles(idManga, { altTitles: fifty });
		const long = await patchAltTitles(idManga, {
			altTitles: ['a'.repeat(255)],
		});

		expect(many.status).toBe(200);
		expect(many.data.altTitles).toHaveLength(50);
		expect(long.status).toBe(200);
	});

	test('responds 404 for missing or deleted manga', async () => {
		const idDeleted = await createManga('Apagado');
		await fetch(`${CONFIG_ENV.URL}/mangas/adm/${idDeleted}`, {
			method: 'DELETE',
		});

		for (const idManga of [999999, idDeleted]) {
			const response = await patchAltTitles(idManga, { altTitles: ['X Y'] });
			expect(response.status).toBe(404);
		}
	});

	test('keeps searchTitles normalized after every write', async () => {
		const idManga = await createManga('Caçador Suicida');
		const expectNormalized = async () => {
			const { title, altTitles, searchTitles } = await storedTitles(idManga);
			expect(searchTitles).toEqual([title, ...altTitles].map(normalizeTitle));
		};

		await expectNormalized();
		await patchAltTitles(idManga, { altTitles: ['Suicide Hunter'] });
		await expectNormalized();
		await admUtils.linkConnector({
			idManga,
			idPlugin: 'test-fixture',
			idMangaPlugin: 'cacador-1',
			titlePlugin: 'Caçador Rank SSS',
		});
		expect((await storedTitles(idManga)).altTitles).toEqual([
			'Suicide Hunter',
			'Caçador Rank SSS',
		]);
		await expectNormalized();
	});
});

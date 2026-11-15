import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import database from '../../../../../infra/database.js';
import api from '../../../../../infra/api.js';
import orchestrator from '../../../../orchestrator.js';
import {
	seedLink,
	seedManga,
	seedSuggestion,
	suggestionRows,
} from '../../../coverSuggestions/seed.js';
import { call } from './http.js';

async function linksOf(idManga) {
	const { rows } = await database.query({
		text: `SELECT "idPlugin", "idMangaPlugin", "titlePlugin" FROM "mangaConnectors" WHERE "idManga" = $1`,
		values: [idManga],
	});
	return rows;
}

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
});

describe('POST /mangas/adm/suggestions/:idSuggestion/accept', () => {
	test('accepts a suggestion by linking the connector', async () => {
		const idManga = await seedManga('Accept manga');
		const chosen = await seedSuggestion(idManga, 'test-fixture', '5', {
			titlePlugin: 'Algo',
		});
		await seedSuggestion(idManga, 'test-fixture', '6');
		await seedSuggestion(idManga, 'test-fixture', '7', { band: 'possible' });

		const { status, body } = await call(
			'POST',
			`/mangas/adm/suggestions/${chosen}/accept`,
		);

		expect(status).toBe(200);
		expect(body).toEqual({
			idMangaConnector: expect.any(Number),
			idManga,
			idPlugin: 'test-fixture',
		});
		expect(await linksOf(idManga)).toEqual([
			{ idPlugin: 'test-fixture', idMangaPlugin: '5', titlePlugin: 'Algo' },
		]);
		const rows = await suggestionRows(idManga);
		expect(rows.map((row) => [row.idMangaPlugin, row.status])).toEqual([
			['5', 'accepted'],
		]);
		expect(rows[0].decidedAt).toBeInstanceOf(Date);
	});

	test('accept merges alternative titles', async () => {
		// The API shares the working directory, so it reads this catalog file.
		const catalogPath = path.resolve('appdata', 'mangas.test-fixture.json');
		const withAltTitles = {
			version: 3,
			mangas: [
				{ id: '1', title: 'Black Clover' },
				{ id: 'solo', title: 'Solo Leveling', altTitles: ['Upando Sozinho'] },
			],
		};
		await writeFile(catalogPath, JSON.stringify(withAltTitles));
		const idManga = await seedManga('Solo Leveling Accept');
		const chosen = await seedSuggestion(idManga, 'test-fixture', 'solo', {
			titlePlugin: 'Solo Leveling',
		});

		const { status } = await call(
			'POST',
			`/mangas/adm/suggestions/${chosen}/accept`,
		);
		await writeFile(
			catalogPath,
			JSON.stringify({ version: 3, mangas: [withAltTitles.mangas[0]] }),
		);

		expect(status).toBe(200);
		const listed = await api.get('/mangas/adm');
		const manga = listed.data.find((row) => row.idManga === idManga);
		expect(manga.altTitles).toEqual(['Solo Leveling', 'Upando Sozinho']);
	});

	test('a manual link clears pending suggestions of that connector', async () => {
		const idManga = await seedManga('Manual link manga');
		await seedSuggestion(idManga, 'test-fixture', '8');
		await seedSuggestion(idManga, 'test-fixture', '10', {
			status: 'dismissed',
		});
		await seedSuggestion(idManga, 'mangeek', 'm1');

		const response = await api.post(`/mangas/adm/${idManga}/connectors`, {
			idPlugin: 'test-fixture',
			idMangaPlugin: '9',
			titlePlugin: 'Manual',
		});

		expect(response.status).toBe(201);
		expect(
			(await suggestionRows(idManga)).map((row) => [
				row.idPlugin,
				row.idMangaPlugin,
				row.status,
			]),
		).toEqual([
			['test-fixture', '10', 'dismissed'],
			['mangeek', 'm1', 'pending'],
		]);
	});

	test('responds 409 when the suggestion cannot be accepted', async () => {
		const idManga = await seedManga('Conflict manga');
		const owner = await seedManga('Conflict owner');
		await seedLink(owner, 'nexustoons', 'owned');
		const dismissed = await seedSuggestion(idManga, 'test-fixture', '11', {
			status: 'dismissed',
		});
		const conflicting = await seedSuggestion(idManga, 'nexustoons', 'owned');
		const alreadyLinked = await seedSuggestion(idManga, 'mangeek', 'm2');
		// Linked behind the service's back, so the pending row survives.
		await seedLink(idManga, 'mangeek', 'm-other');

		for (const idSuggestion of [dismissed, conflicting, alreadyLinked]) {
			const { status, body } = await call(
				'POST',
				`/mangas/adm/suggestions/${idSuggestion}/accept`,
			);
			expect(status, `suggestion ${idSuggestion}`).toBe(409);
			expect(body.name).toBe('ConflictError');
		}
		expect((await linksOf(idManga)).map((link) => link.idMangaPlugin)).toEqual([
			'm-other',
		]);
	});
});

import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runner as migrationRunner } from 'node-pg-migrate';
import { beforeAll, describe, expect, test } from 'vitest';
import database from '../../../infra/database.js';
import orchestrator from '../../orchestrator.js';
import { seedManga } from '../coverSuggestions/seed.js';

async function tableExists(name) {
	const { rows } = await database.query({
		text: 'SELECT to_regclass($1) AS t',
		values: [`"${name}"`],
	});
	return rows[0].t !== null;
}

// Reverts this migration and every later one, so later migrations do not
// shift which one the test undoes.
async function migrateDownOne() {
	const dir = resolve('src', 'infra', 'migrations');
	const count = (await readdir(dir)).filter(
		(file) => file >= '1760700000000_add-cover-suggestions',
	).length;
	const dbClient = await database.getNewClient();
	try {
		await migrationRunner({
			dbClient,
			dir,
			direction: 'down',
			count,
			migrationsTable: 'pgmigrations',
			verbose: false,
		});
	} finally {
		await dbClient.end();
	}
}

const insertHash = (idMangaPlugin) =>
	database.query({
		text: `INSERT INTO "catalogCoverHashes" ("idPlugin", "idMangaPlugin", "coverUrl") VALUES ('mangeek', $1, 'u')`,
		values: [idMangaPlugin],
	});
const insertSuggestion = (
	idManga,
	{ band = 'strong', status = 'pending' } = {},
) =>
	database.query({
		text: `INSERT INTO "coverSuggestions" ("idManga", "idPlugin", "idMangaPlugin", "titlePlugin", "dSimilarity", "pSimilarity", "titleSimilarity", "band", "status")
			VALUES ($1, 'mangeek', $2, 't', 1, 1, 0, $3, $4)`,
		values: [idManga, `${band}-${status}`, band, status],
	});

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
});

describe('cover suggestions migration', () => {
	test('creates the cover suggestion tables with their constraints', async () => {
		const idManga = await seedManga('Migration manga');

		await insertHash('1');
		await expect(insertHash('1')).rejects.toThrow('duplicate key');
		await insertSuggestion(idManga);
		await expect(insertSuggestion(idManga)).rejects.toThrow('duplicate key');
		await expect(insertSuggestion(idManga, { band: 'x' })).rejects.toThrow(
			'check constraint',
		);
		await expect(insertSuggestion(idManga, { status: 'x' })).rejects.toThrow(
			'check constraint',
		);

		await migrateDownOne();
		expect(await tableExists('catalogCoverHashes')).toBe(false);
		expect(await tableExists('coverSuggestions')).toBe(false);

		await orchestrator.runMigrations();
		expect(await tableExists('catalogCoverHashes')).toBe(true);
		expect(await tableExists('coverSuggestions')).toBe(true);
	});
});

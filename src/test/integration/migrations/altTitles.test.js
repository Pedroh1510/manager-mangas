import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runner as migrationRunner } from 'node-pg-migrate';
import { beforeAll, describe, expect, test } from 'vitest';
import database from '../../../infra/database.js';
import orchestrator from '../../orchestrator.js';

const MIGRATIONS_DIR = resolve('src', 'infra', 'migrations');
const ALT_TITLES_MIGRATION = '1760800000000_add-alt-titles';

async function migrate(direction, count) {
	const dbClient = await database.getNewClient();
	try {
		await migrationRunner({
			dbClient,
			dir: MIGRATIONS_DIR,
			direction,
			count,
			migrationsTable: 'pgmigrations',
			verbose: false,
		});
	} finally {
		await dbClient.end();
	}
}

// Reverts every migration from `name` onward, so the test still lands right
// before it once later migrations exist.
async function migrationsFrom(name) {
	const files = await readdir(MIGRATIONS_DIR);
	return files.filter((file) => file >= name).length;
}

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
});

describe('alt titles migration', () => {
	test('adds altTitles and searchTitles to mangas', async () => {
		const count = await migrationsFrom(ALT_TITLES_MIGRATION);
		await migrate('down', count);
		const { rows } = await database.query({
			text: `INSERT INTO mangas (title) VALUES ($1) RETURNING "idManga"`,
			values: ['Caçador Suicida'],
		});
		await migrate('up', count);

		const { rows: stored } = await database.query({
			text: `SELECT "altTitles", "searchTitles" FROM mangas WHERE "idManga" = $1`,
			values: [rows[0].idManga],
		});
		expect(stored[0]).toEqual({
			altTitles: [],
			searchTitles: ['cacador suicida'],
		});
		const { rows: columns } = await database.query(
			`SELECT column_name, is_nullable, column_default, udt_name FROM information_schema.columns
			WHERE table_name = 'mangas' AND column_name IN ('altTitles', 'searchTitles') ORDER BY column_name`,
		);
		expect(columns).toEqual([
			{
				column_name: 'altTitles',
				is_nullable: 'NO',
				column_default: "'{}'::text[]",
				udt_name: '_text',
			},
			{
				column_name: 'searchTitles',
				is_nullable: 'NO',
				column_default: "'{}'::text[]",
				udt_name: '_text',
			},
		]);
	});

	test('adds origin and nullable similarities to coverSuggestions', async () => {
		const count = await migrationsFrom('1760900000000_add-suggestion-origin');
		await migrate('down', count);
		const { rows } = await database.query({
			text: `INSERT INTO mangas (title) VALUES ('Origin migration') RETURNING "idManga"`,
		});
		const idManga = rows[0].idManga;
		await database.query({
			text: `INSERT INTO "coverSuggestions" ("idManga", "idPlugin", "idMangaPlugin", "titlePlugin", "dSimilarity", "pSimilarity", "titleSimilarity", "band")
				VALUES ($1, 'mangeek', 'old', 't', 0.9, 0.9, 0, 'strong')`,
			values: [idManga],
		});
		await migrate('up', count);

		const { rows: stored } = await database.query({
			text: `SELECT "origin" FROM "coverSuggestions" WHERE "idManga" = $1`,
			values: [idManga],
		});
		expect(stored).toEqual([{ origin: 'cover' }]);
		const insert = (idMangaPlugin, origin) =>
			database.query({
				text: `INSERT INTO "coverSuggestions" ("idManga", "idPlugin", "idMangaPlugin", "titlePlugin", "dSimilarity", "pSimilarity", "titleSimilarity", "band", "origin")
					VALUES ($1, 'mangeek', $2, 't', NULL, NULL, 0.95, 'possible', $3)`,
				values: [idManga, idMangaPlugin, origin],
			});
		await expect(insert('by-title', 'title')).resolves.toBeDefined();
		await expect(insert('bad', 'other')).rejects.toThrow(/check constraint/);
	});
});

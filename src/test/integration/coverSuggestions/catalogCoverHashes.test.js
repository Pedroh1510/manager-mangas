import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { registerForTests } from '../../../connectors/registry.js';
import TestFixtureConnector from '../../../connectors/testFixture/TestFixtureConnector.js';
import database from '../../../infra/database.js';
import CatalogCoverHashesRepository from '../../../repository/catalogCoverHashes.js';
import CoverSuggestions from '../../../service/coverSuggestions/index.js';
import { getCoverHashQueue } from '../../../service/queue/coverHashQueue.js';
import orchestrator from '../../orchestrator.js';
import { seedHash, seedManga, seedSuggestion, suggestionRows } from './seed.js';

const PLUGIN = 'test-fixture';
const catalogPath = path.resolve('appdata', `mangas.${PLUGIN}.json`);
const BIT_63 = 1n << 63n;

async function hashRow(idMangaPlugin) {
	const rows = await CatalogCoverHashesRepository.listByPlugin({ idPlugin: PLUGIN });
	return rows.filter((row) => row.idMangaPlugin === idMangaPlugin);
}

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
	registerForTests(PLUGIN, TestFixtureConnector);
});

afterAll(async () => {
	await getCoverHashQueue(PLUGIN).obliterate({ force: true });
	await rm(catalogPath, { force: true });
});

describe('catalogCoverHashes', () => {
	test('upserts a hash and resets the failure state', async () => {
		await database.query({
			text: `INSERT INTO "catalogCoverHashes" ("idPlugin", "idMangaPlugin", "coverUrl", "failureCount", "failedAt")
				VALUES ($1, 'a', 'https://img.example/old.jpg', 3, now())`,
			values: [PLUGIN],
		});
		const dHash = BigInt.asIntN(64, BIT_63 | 5n);

		await CatalogCoverHashesRepository.upsertHash({
			idPlugin: PLUGIN,
			idMangaPlugin: 'a',
			coverUrl: 'https://img.example/new.jpg',
			dHash,
			pHash: 42n,
			hashedAt: new Date(),
		});

		const rows = await hashRow('a');
		expect(rows).toHaveLength(1);
		expect(dHash).toBeLessThan(0n);
		expect(rows[0]).toMatchObject({
			coverUrl: 'https://img.example/new.jpg',
			dHash,
			pHash: 42n,
			failureCount: 0,
			failedAt: null,
		});
		expect(rows[0].hashedAt).toBeInstanceOf(Date);
	});

	test('recordFailure counts per coverUrl', async () => {
		const failure = { idPlugin: PLUGIN, idMangaPlugin: 'f', failedAt: new Date() };

		await CatalogCoverHashesRepository.recordFailure({ ...failure, coverUrl: 'u1' });
		await CatalogCoverHashesRepository.recordFailure({ ...failure, coverUrl: 'u1' });
		const sameUrl = (await hashRow('f'))[0];
		await CatalogCoverHashesRepository.recordFailure({ ...failure, coverUrl: 'u2' });
		const newUrl = (await hashRow('f'))[0];

		expect(sameUrl).toMatchObject({ failureCount: 2, dHash: null, pHash: null });
		expect(newUrl).toMatchObject({ failureCount: 1, coverUrl: 'u2' });
	});

	test('drops index rows and pending suggestions of removed items', async () => {
		const idManga = await seedManga('Removed item manga');
		await seedHash(PLUGIN, 'keep', { dHash: 1n, pHash: 1n });
		await seedHash(PLUGIN, 'x', { dHash: 2n, pHash: 2n });
		await seedSuggestion(idManga, PLUGIN, 'x', { status: 'pending' });
		const otherManga = await seedManga('Removed item manga 2');
		await seedSuggestion(otherManga, PLUGIN, 'x', { status: 'dismissed' });
		const thirdManga = await seedManga('Removed item manga 3');
		await seedSuggestion(thirdManga, PLUGIN, 'x', { status: 'accepted' });
		await writeFile(
			catalogPath,
			JSON.stringify({
				version: 2,
				mangas: [{ id: 'keep', title: 'Keep', coverUrl: 'https://img.example/keep.jpg' }],
			}),
		);

		await CoverSuggestions.syncConnectorIndex(PLUGIN);

		expect(await hashRow('x')).toEqual([]);
		expect(await hashRow('keep')).toHaveLength(1);
		expect(await suggestionRows(idManga)).toEqual([]);
		expect((await suggestionRows(otherManga)).map((row) => row.status)).toEqual(['dismissed']);
		expect((await suggestionRows(thirdManga)).map((row) => row.status)).toEqual(['accepted']);
	});
});

import { beforeAll, describe, expect, test } from 'vitest';
import { registerForTests } from '../../../connectors/registry.js';
import TestFixtureConnector from '../../../connectors/testFixture/TestFixtureConnector.js';
import CatalogCoverHashesRepository from '../../../repository/catalogCoverHashes.js';
import CoverSuggestionsRepository from '../../../repository/coverSuggestions.js';
import CoverSuggestions from '../../../service/coverSuggestions/index.js';
import orchestrator from '../../orchestrator.js';
import { seedHash, seedLink, seedManga, seedSuggestion, suggestionRows } from './seed.js';

const BIT_63 = 1n << 63n;
const bitsOff = (bits) => (1n << BigInt(bits)) - 1n;

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
	// Same registry as the test API (server.js), so test-fixture is a
	// connector the manga can be missing.
	registerForTests('test-fixture', TestFixtureConnector);
});

describe('cover matching on Postgres', () => {
	test('lists mangas missing a registered connector', async () => {
		const onlyMangeek = await seedManga('Only mangeek');
		await seedLink(onlyMangeek, 'mangeek', 'e1');
		const noLink = await seedManga('No link');
		const both = await seedManga('Both');
		await seedLink(both, 'mangeek', 'e2');
		await seedLink(both, 'nexustoons', 'n2');
		const inactive = await seedManga('Both one inactive');
		await seedLink(inactive, 'mangeek', 'e3');
		await seedLink(inactive, 'NexusToons', 'n3', { isActive: false });
		const deleted = await seedManga('Deleted', { deleted: true });
		await seedLink(deleted, 'mangeek', 'e4');

		const mangas = await CoverSuggestionsRepository.listMangasMissingConnectors({
			connectorIds: ['mangeek', 'nexustoons'],
		});

		expect(mangas.map((manga) => manga.idManga)).toEqual([onlyMangeek, noLink]);
	});

	test('finds candidates by hamming distance in postgres', async () => {
		const reference = { dHash: BIT_63, pHash: BIT_63 };
		// Both differ from the reference only in pHash; dHash is far away.
		await seedHash('nexustoons', 'six-bits', { dHash: bitsOff(40), pHash: BIT_63 | bitsOff(6) });
		await seedHash('nexustoons', 'thirteen-bits', { dHash: bitsOff(40), pHash: BIT_63 | bitsOff(13) });

		const candidates = await CatalogCoverHashesRepository.findCandidates({
			idPlugin: 'nexustoons',
			references: [reference],
			maxDistance: 12,
		});

		expect(candidates.map((row) => row.idMangaPlugin)).toEqual(['six-bits']);
		expect(candidates[0].pHash).toBe(BigInt.asIntN(64, BIT_63 | bitsOff(6)));
	});

	test('rerun replaces pending and keeps decided suggestions', async () => {
		const idManga = await seedManga('Rerun manga');
		await seedLink(idManga, 'mangeek', 'ref', { titlePlugin: 'Rerun manga' });
		await seedHash('mangeek', 'ref', { dHash: 7n, pHash: 7n });
		for (const id of ['a', 'b', 'd']) await seedHash('test-fixture', id, { dHash: 7n, pHash: 7n });
		await seedSuggestion(idManga, 'test-fixture', 'a', { status: 'dismissed' });
		await seedSuggestion(idManga, 'test-fixture', 'b', { status: 'accepted' });
		await seedSuggestion(idManga, 'test-fixture', 'c', { status: 'pending' });

		await CoverSuggestions.matchManga({ idManga, title: 'Rerun manga' });

		const testFixtureRows = (await suggestionRows(idManga)).filter(
			(row) => row.idPlugin === 'test-fixture',
		);
		expect(testFixtureRows.map((row) => [row.idMangaPlugin, row.status])).toEqual([
			['a', 'dismissed'],
			['b', 'accepted'],
			['d', 'pending'],
		]);
	});
});

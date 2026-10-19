import { beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../../../orchestrator.js';
import {
	seedLink,
	seedManga,
	seedSuggestion,
} from '../../../coverSuggestions/seed.js';
import { call } from './http.js';

let ids;

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
	const idManga = await seedManga('Listed manga');
	const other = await seedManga('Owner manga');
	await seedLink(other, 'nexustoons', 'taken');
	ids = {
		idManga,
		other,
		strong91: await seedSuggestion(idManga, 'nexustoons', 's91', {
			dSimilarity: 0.91,
			pSimilarity: 0.5,
		}),
		possible85: await seedSuggestion(idManga, 'nexustoons', 'p85', {
			dSimilarity: 0.85,
			pSimilarity: 0.5,
			band: 'possible',
		}),
		strong97: await seedSuggestion(idManga, 'nexustoons', 's97', {
			dSimilarity: 0.6,
			pSimilarity: 0.97,
		}),
		conflict: await seedSuggestion(idManga, 'nexustoons', 'taken', {
			dSimilarity: 0.88,
			pSimilarity: 0.5,
			band: 'possible',
		}),
		dismissed: await seedSuggestion(idManga, 'nexustoons', 'gone', {
			status: 'dismissed',
		}),
		accepted: await seedSuggestion(idManga, 'nexustoons', 'done', {
			status: 'accepted',
		}),
	};
});

describe('GET /mangas/adm/suggestions', () => {
	test('lists pending suggestions and conflicts', async () => {
		const { status, body } = await call('GET', '/mangas/adm/suggestions');

		expect(status).toBe(200);
		expect(body.suggestions.map((s) => s.idSuggestion)).toEqual([
			ids.strong97,
			ids.strong91,
			ids.possible85,
		]);
		expect(body.suggestions[0]).toEqual({
			idSuggestion: ids.strong97,
			idManga: ids.idManga,
			title: 'Listed manga',
			idPlugin: 'nexustoons',
			idMangaPlugin: 's97',
			titlePlugin: 'Title s97',
			score: expect.closeTo(0.97, 5),
			band: 'strong',
			origin: 'cover',
			titleSimilarity: 0,
		});
		expect(body.conflicts).toEqual([
			expect.objectContaining({
				idSuggestion: ids.conflict,
				conflictIdManga: ids.other,
				conflictTitle: 'Owner manga',
			}),
		]);
	});

	test('exposes origin and lists title-only after cover matches', async () => {
		const idManga = await seedManga('Origin manga');
		const titleOnly = await seedSuggestion(idManga, 'mangeek', 'by-title', {
			dSimilarity: null,
			pSimilarity: null,
			titleSimilarity: 0.95,
			band: 'possible',
			origin: 'title',
		});
		const byCover = await seedSuggestion(idManga, 'mangeek', 'by-cover', {
			dSimilarity: 0.85,
			pSimilarity: 0.5,
			band: 'possible',
		});

		const { status, body } = await call('GET', '/mangas/adm/suggestions');

		expect(status).toBe(200);
		const ofManga = body.suggestions.filter((s) => s.idManga === idManga);
		expect(ofManga.map((s) => [s.idSuggestion, s.origin, s.score])).toEqual([
			[byCover, 'cover', expect.closeTo(0.85, 5)],
			[titleOnly, 'title', null],
		]);
	});

	test('filters by status and rejects an unknown status', async () => {
		const dismissed = await call(
			'GET',
			'/mangas/adm/suggestions?status=dismissed',
		);
		const accepted = await call(
			'GET',
			'/mangas/adm/suggestions?status=accepted',
		);
		const invalid = await call('GET', '/mangas/adm/suggestions?status=xyz');

		expect(dismissed.status).toBe(200);
		expect(dismissed.body.suggestions.map((s) => s.idSuggestion)).toEqual([
			ids.dismissed,
		]);
		expect(dismissed.body.conflicts).toEqual([]);
		expect(accepted.status).toBe(200);
		expect(accepted.body.suggestions.map((s) => s.idSuggestion)).toEqual([
			ids.accepted,
		]);
		expect(invalid.status).toBe(400);
		expect(invalid.body.name).toBe('ValidationError');
		expect(invalid.body.message).toContain('status');
	});
});

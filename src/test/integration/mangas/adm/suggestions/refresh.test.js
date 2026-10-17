import { beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../../../orchestrator.js';
import { seedHash, seedLink, seedManga } from '../../../coverSuggestions/seed.js';
import { call } from './http.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
});

describe('POST /mangas/adm/:idManga/suggestions/refresh', () => {
	test('runs the matching for one manga', async () => {
		const idManga = await seedManga('Refresh manga');
		await seedLink(idManga, 'test-fixture', '1', { titlePlugin: 'Refresh manga' });
		await seedHash('test-fixture', '1', { dHash: 99n, pHash: 99n });
		await seedHash('nexustoons', 'same-cover', { dHash: 99n, pHash: 99n });

		const { status, body } = await call('POST', `/mangas/adm/${idManga}/suggestions/refresh`);

		expect(status).toBe(200);
		expect(body).toEqual({
			idManga,
			suggestions: [
				expect.objectContaining({
					idManga,
					idPlugin: 'nexustoons',
					idMangaPlugin: 'same-cover',
					band: 'strong',
					score: 1,
				}),
			],
			conflicts: [],
		});
	});

	test('responds 404 for a missing or deleted manga', async () => {
		const deleted = await seedManga('Deleted refresh manga', { deleted: true });

		for (const idManga of [999999, deleted]) {
			const { status } = await call('POST', `/mangas/adm/${idManga}/suggestions/refresh`);
			expect(status, `manga ${idManga}`).toBe(404);
		}
	});

	test('rejects an invalid idManga', async () => {
		for (const invalid of ['abc', '0', '-1']) {
			const { status, body } = await call('POST', `/mangas/adm/${invalid}/suggestions/refresh`);
			expect(status, invalid).toBe(400);
			expect(body.name).toBe('ValidationError');
		}
	});
});

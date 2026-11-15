import { beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../../../orchestrator.js';
import { seedManga, seedSuggestion, suggestionRows } from '../../../coverSuggestions/seed.js';
import { call } from './http.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
});

describe('POST /mangas/adm/suggestions/:idSuggestion/dismiss', () => {
	test('dismisses a pending suggestion', async () => {
		const idManga = await seedManga('Dismiss manga');
		const idSuggestion = await seedSuggestion(idManga, 'mangeek', 'd1');

		const { status, body } = await call('POST', `/mangas/adm/suggestions/${idSuggestion}/dismiss`);

		expect(status).toBe(200);
		expect(body).toEqual({ idSuggestion, status: 'dismissed' });
		const [row] = await suggestionRows(idManga);
		expect(row.status).toBe('dismissed');
		expect(row.decidedAt).toBeInstanceOf(Date);
	});

	test('responds 409 for a decided suggestion', async () => {
		const idManga = await seedManga('Accepted manga');
		const idSuggestion = await seedSuggestion(idManga, 'mangeek', 'd2', { status: 'accepted' });

		const { status, body } = await call('POST', `/mangas/adm/suggestions/${idSuggestion}/dismiss`);

		expect(status).toBe(409);
		expect(body.name).toBe('ConflictError');
	});

	test('validates and resolves the suggestion id', async () => {
		for (const action of ['accept', 'dismiss']) {
			const missing = await call('POST', `/mangas/adm/suggestions/999999/${action}`);
			expect(missing.status, `${action} 999999`).toBe(404);
			for (const invalid of ['abc', '0', '-1']) {
				const { status, body } = await call('POST', `/mangas/adm/suggestions/${invalid}/${action}`);
				expect(status, `${action} ${invalid}`).toBe(400);
				expect(body.name).toBe('ValidationError');
			}
		}
	});
});

import { afterEach, describe, expect, test, vi } from 'vitest';
import database from '../../../infra/database.js';
import MangasRepository from '../../../repository/mangas.js';

vi.mock('../../../infra/database.js', () => ({
	default: { query: vi.fn() },
}));

describe('MangasRepository', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('listMangas aggregates connectors in a single query', async () => {
		const rows = [
			{ idManga: 1, title: 'A', connectors: [] },
			{ idManga: 2, title: 'B', connectors: [] },
			{ idManga: 3, title: 'C', connectors: [] },
		];
		database.query.mockResolvedValueOnce({ rows });

		const result = await MangasRepository.listMangas();

		expect(result).toEqual(rows);
		expect(database.query).toHaveBeenCalledTimes(1);
		const [{ text }] = database.query.mock.calls[0];
		expect(text).toMatch(/LEFT JOIN "mangaConnectors"/i);
		expect(text).toMatch(/json_agg/i);
	});
});

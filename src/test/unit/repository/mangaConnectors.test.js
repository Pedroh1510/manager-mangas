import { afterEach, describe, expect, test, vi } from 'vitest';
import database from '../../../infra/database.js';
import MangaConnectorsRepository from '../../../repository/mangaConnectors.js';

vi.mock('../../../infra/database.js', () => ({
	default: { query: vi.fn() },
}));

describe('MangaConnectorsRepository', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('setAllConnectorsActive updates every link in one statement', async () => {
		database.query.mockResolvedValueOnce({ rowCount: 2, rows: [] });

		const updated = await MangaConnectorsRepository.setAllConnectorsActive({
			idManga: 7,
			isActive: true,
		});

		expect(updated).toEqual(2);
		expect(database.query).toHaveBeenCalledTimes(1);
		const [{ text, values }] = database.query.mock.calls[0];
		expect(text).toMatch(/^UPDATE "mangaConnectors" SET/);
		expect(text).toMatch(/WHERE "idManga" = \$\d+$/);
		expect(values).toContain(7);
		expect(values).toContain(true);
	});
});

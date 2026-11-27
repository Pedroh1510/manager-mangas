import { afterEach, describe, expect, test, vi } from 'vitest';
import database from '../../../infra/database.js';
import ChaptersRepository from '../../../repository/chapters.js';

vi.mock('../../../infra/database.js', () => ({
	default: { query: vi.fn() },
}));

describe('ChaptersRepository.updateChapterSource', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('updates link, plugin id, name and downloadedAt of one row', async () => {
		database.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });

		await ChaptersRepository.updateChapterSource({
			idChapter: 1248700,
			idMangaConnector: 31,
			idChapterPlugin: '435999',
			name: 'Capítulo 177',
		});

		const [{ text, values }] = database.query.mock.calls[0];
		expect(text).toMatch(/^UPDATE "?chapters"? SET/);
		expect(text).toMatch(/"downloadedAt"/);
		expect(text).toMatch(/WHERE "idChapter" = \$\d+$/);
		expect(values).toEqual(
			expect.arrayContaining([31, '435999', 'Capítulo 177', 1248700]),
		);
	});

	test('propagates a unique violation instead of swallowing it', async () => {
		const duplicate = Object.assign(new Error('duplicate key'), {
			code: '23505',
		});
		database.query.mockRejectedValueOnce(duplicate);

		await expect(
			ChaptersRepository.updateChapterSource({
				idChapter: 1,
				idMangaConnector: 31,
				idChapterPlugin: 'x',
				name: 'n',
			}),
		).rejects.toBe(duplicate);
	});
});

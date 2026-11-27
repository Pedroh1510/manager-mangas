import { describe, expect, test } from 'vitest';
import { NotFoundError } from '../../../infra/errors.js';
import { createChapterFixes } from '../../../service/chapterFixes.js';
import FakeChapterFixesDeps from '../../fakes/FakeChapterFixesDeps.js';

const chapter = {
	idChapter: 1248700,
	idManga: 15,
	idMangaConnector: 15,
	idChapterPlugin: '1700083334',
	volume: '177.0000',
	title: 'Sobrevivendo...',
};

function build(options) {
	const deps = new FakeChapterFixesDeps(options);
	return { deps, fixes: createChapterFixes(deps.asDeps()) };
}

describe('ChapterFixes', () => {
	test('blockChapter inserts block, deletes chapter, scans Kavita', async () => {
		const { deps, fixes } = build({ chapter });
		const result = await fixes.blockChapter({
			idManga: 15,
			idChapter: 1248700,
			reason: 'cópia do 171',
		});
		expect(result).toEqual({ idBlockedChapter: 7 });
		expect(deps.inserted).toEqual([
			{
				idMangaConnector: 15,
				idChapterPlugin: '1700083334',
				volume: '177.0000',
				reason: 'cópia do 171',
			},
		]);
		expect(deps.deleted).toEqual([{ idManga: 15, idChapter: 1248700 }]);
		expect(deps.scanned).toEqual([{ title: 'Sobrevivendo...' }]);
	});

	test('blockChapter of another manga throws NotFoundError and changes nothing', async () => {
		const { deps, fixes } = build({ chapter });
		await expect(
			fixes.blockChapter({ idManga: 99, idChapter: 1248700, reason: null }),
		).rejects.toBeInstanceOf(NotFoundError);
		expect(deps.inserted).toEqual([]);
		expect(deps.deleted).toEqual([]);
	});

	test('blockChapter of missing chapter throws NotFoundError', async () => {
		const { fixes } = build({ chapter: null });
		await expect(
			fixes.blockChapter({ idManga: 15, idChapter: 1, reason: null }),
		).rejects.toThrow(/1.*15/);
	});

	test('blockChapter still resolves when Kavita scan returns false', async () => {
		const { fixes } = build({ chapter, scanResult: false });
		await expect(
			fixes.blockChapter({ idManga: 15, idChapter: 1248700, reason: null }),
		).resolves.toEqual({ idBlockedChapter: 7 });
	});

	test('unblock unknown id throws NotFoundError', async () => {
		const { deps, fixes } = build({ chapter });
		deps.unblockedCount = 0;
		await expect(
			fixes.unblock({ idManga: 15, idBlockedChapter: 5 }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	test('unblock existing id resolves and listBlocked returns rows', async () => {
		const { fixes } = build({ chapter });
		await expect(
			fixes.unblock({ idManga: 15, idBlockedChapter: 5 }),
		).resolves.toBeUndefined();
		await expect(fixes.listBlocked({ idManga: 15 })).resolves.toEqual([]);
	});
});

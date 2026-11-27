import { describe, expect, test } from 'vitest';
import ChapterFixesValidator from '../../../validators/chapterFixesValidator.js';

const params = { idManga: 15, idChapter: 1248700 };

function validateReplace(idChapterPlugin) {
	const body = { idMangaConnector: 31, idChapterPlugin };
	return ChapterFixesValidator.replaceSource(
		{ params, body },
		null,
		() => 'ok',
	);
}

describe('ChapterFixesValidator.replaceSource', () => {
	test('accepts an idChapterPlugin of 200 chars', async () => {
		await expect(validateReplace('x'.repeat(200))).resolves.toBe('ok');
	});

	test('rejects an idChapterPlugin over 200 chars', async () => {
		await expect(validateReplace('x'.repeat(201))).rejects.toThrow(
			/less than or equal to 200/,
		);
	});
});

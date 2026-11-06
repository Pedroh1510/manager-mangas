import { describe, expect, test } from 'vitest';
import {
	PlaceholderChapterError,
	assertNotPlaceholderChapter,
	hashPageBytes,
} from '../../../service/placeholderChapter.js';

describe('assertNotPlaceholderChapter', () => {
	test('throws when three or more pages share one hash', () => {
		const hashes = ['abc', 'abc', 'abc'];

		expect(() =>
			assertNotPlaceholderChapter({ manga: 'M', chapter: 54, hashes }),
		).toThrow(PlaceholderChapterError);
	});

	test('names the manga, chapter and page count in the error', () => {
		const hashes = ['abc', 'abc', 'abc', 'abc'];

		expect(() =>
			assertNotPlaceholderChapter({ manga: 'M', chapter: 54, hashes }),
		).toThrow(/M.*54.*4/);
	});

	test('passes when any page differs', () => {
		const hashes = ['abc', 'abc', 'def'];

		expect(() =>
			assertNotPlaceholderChapter({ manga: 'M', chapter: 1, hashes }),
		).not.toThrow();
	});

	test('passes for chapters too short to judge', () => {
		expect(() =>
			assertNotPlaceholderChapter({
				manga: 'M',
				chapter: 1,
				hashes: ['a', 'a'],
			}),
		).not.toThrow();
	});
});

describe('hashPageBytes', () => {
	test('returns the same hash for equal bytes and a different one otherwise', () => {
		const first = hashPageBytes(Buffer.from('x'));

		expect(hashPageBytes(Buffer.from('x'))).toBe(first);
		expect(hashPageBytes(Buffer.from('y'))).not.toBe(first);
	});
});

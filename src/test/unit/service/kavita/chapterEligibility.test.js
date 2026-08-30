import { describe, expect, test } from 'vitest';
import {
	flattenKavitaChapters,
	selectChaptersToDelete,
} from '../../../../service/kavita/chapterEligibility.js';

describe('flattenKavitaChapters', () => {
	test('flattens chapters across every volume', () => {
		const volumes = [
			{ chapters: [{ minNumber: 1 }, { minNumber: 2 }] },
			{ chapters: [{ minNumber: 3 }] },
		];

		expect(flattenKavitaChapters(volumes)).toEqual([
			{ minNumber: 1 },
			{ minNumber: 2 },
			{ minNumber: 3 },
		]);
	});

	test('handles a volume with no chapters field', () => {
		expect(flattenKavitaChapters([{}])).toEqual([]);
	});

	test('handles an empty volumes array', () => {
		expect(flattenKavitaChapters([])).toEqual([]);
	});
});

describe('selectChaptersToDelete', () => {
	const downloadedAt = new Date('2026-01-01');

	test('deletes a fully-read chapter that is not the highest volume', () => {
		const localChapters = [
			{ idChapter: 1, volume: '1.0000', downloadedAt },
			{ idChapter: 2, volume: '2.0000', downloadedAt },
		];
		const kavitaChapters = [
			{ minNumber: 1, pages: 20, pagesRead: 20 },
			{ minNumber: 2, pages: 20, pagesRead: 20 },
		];

		const result = selectChaptersToDelete({ localChapters, kavitaChapters });

		expect(result).toEqual([{ idChapter: 1, volume: '1.0000', downloadedAt }]);
	});

	test('never deletes the highest-volume chapter, even if fully read', () => {
		const localChapters = [{ idChapter: 1, volume: '1.0000', downloadedAt }];
		const kavitaChapters = [{ minNumber: 1, pages: 20, pagesRead: 20 }];

		expect(selectChaptersToDelete({ localChapters, kavitaChapters })).toEqual(
			[],
		);
	});

	test('never deletes a partially-read chapter', () => {
		const localChapters = [
			{ idChapter: 1, volume: '1.0000', downloadedAt },
			{ idChapter: 2, volume: '2.0000', downloadedAt },
		];
		const kavitaChapters = [
			{ minNumber: 1, pages: 20, pagesRead: 10 },
			{ minNumber: 2, pages: 20, pagesRead: 20 },
		];

		expect(selectChaptersToDelete({ localChapters, kavitaChapters })).toEqual(
			[],
		);
	});

	test('never deletes a chapter not yet downloaded', () => {
		const localChapters = [
			{ idChapter: 1, volume: '1.0000', downloadedAt: null },
			{ idChapter: 2, volume: '2.0000', downloadedAt },
		];
		const kavitaChapters = [
			{ minNumber: 1, pages: 20, pagesRead: 20 },
			{ minNumber: 2, pages: 20, pagesRead: 20 },
		];

		expect(selectChaptersToDelete({ localChapters, kavitaChapters })).toEqual(
			[],
		);
	});

	test('never deletes a chapter with no matching Kavita chapter', () => {
		const localChapters = [
			{ idChapter: 1, volume: '1.0000', downloadedAt },
			{ idChapter: 2, volume: '2.0000', downloadedAt },
		];
		const kavitaChapters = [{ minNumber: 1, pages: 20, pagesRead: 20 }];

		expect(selectChaptersToDelete({ localChapters, kavitaChapters })).toEqual(
			[],
		);
	});

	test('never treats a zero-page Kavita chapter as read', () => {
		const localChapters = [
			{ idChapter: 1, volume: '1.0000', downloadedAt },
			{ idChapter: 2, volume: '2.0000', downloadedAt },
		];
		const kavitaChapters = [
			{ minNumber: 1, pages: 0, pagesRead: 0 },
			{ minNumber: 2, pages: 20, pagesRead: 20 },
		];

		expect(selectChaptersToDelete({ localChapters, kavitaChapters })).toEqual(
			[],
		);
	});

	test('matches chapter numbers despite NUMERIC(14,4) zero-padding vs plain float', () => {
		const localChapters = [
			{ idChapter: 1, volume: '1.0000', downloadedAt },
			{ idChapter: 2, volume: '2.5000', downloadedAt },
		];
		const kavitaChapters = [
			{ minNumber: 1, pages: 20, pagesRead: 20 },
			{ minNumber: 2.5, pages: 20, pagesRead: 20 },
		];

		const result = selectChaptersToDelete({ localChapters, kavitaChapters });

		expect(result).toEqual([{ idChapter: 1, volume: '1.0000', downloadedAt }]);
	});

	test('returns an empty array when there are no downloaded chapters', () => {
		expect(
			selectChaptersToDelete({ localChapters: [], kavitaChapters: [] }),
		).toEqual([]);
	});

	test('never deletes a chapter whose volume ambiguously matches more than one Kavita chapter', () => {
		// Regression test: Kavita can assign minNumber: 0 to multiple specials/unparseable
		// chapters. If two Kavita chapters share the same minNumber, picking either one
		// arbitrarily would delete a local file based on a DIFFERENT chapter's read state.
		// An ambiguous match must be treated like no match at all: never delete.
		const localChapters = [
			{ idChapter: 1, volume: '0.0000', downloadedAt },
			{ idChapter: 2, volume: '1.0000', downloadedAt },
		];
		const kavitaChapters = [
			{ minNumber: 0, pages: 20, pagesRead: 20 }, // fully read
			{ minNumber: 0, pages: 20, pagesRead: 5 }, // not fully read
		];

		expect(selectChaptersToDelete({ localChapters, kavitaChapters })).toEqual(
			[],
		);
	});

	test('keeps the highest-volume chapter among the eligible (fully-read), not among all local chapters', () => {
		// Regression test: chapter 2 is highest among eligible chapters (1, 2 are fully read)
		// Chapter 3 is ineligible (partially read) so it doesn't affect the keep-highest rule.
		// Expected: only chapter 1 deleted; chapter 2 kept (highest eligible); chapter 3 never eligible.
		const localChapters = [
			{ idChapter: 1, volume: '1.0000', downloadedAt },
			{ idChapter: 2, volume: '2.0000', downloadedAt },
			{ idChapter: 3, volume: '3.0000', downloadedAt }, // partially read, not eligible
		];
		const kavitaChapters = [
			{ minNumber: 1, pages: 20, pagesRead: 20 },
			{ minNumber: 2, pages: 20, pagesRead: 20 },
			{ minNumber: 3, pages: 20, pagesRead: 10 }, // not fully read
		];

		const result = selectChaptersToDelete({ localChapters, kavitaChapters });

		expect(result).toEqual([{ idChapter: 1, volume: '1.0000', downloadedAt }]);
	});
});

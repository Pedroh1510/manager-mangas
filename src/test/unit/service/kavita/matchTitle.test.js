import { describe, expect, test } from 'vitest';
import { findMatchingSeries, normalizeTitle } from '../../../../service/kavita/matchTitle.js';

describe('normalizeTitle', () => {
	test('lowercases the title', () => {
		expect(normalizeTitle('Black Clover')).toBe('black clover');
	});

	test('strips accents', () => {
		expect(normalizeTitle('Jujutsu Kaisén')).toBe('jujutsu kaisen');
	});

	test('collapses repeated whitespace and trims', () => {
		expect(normalizeTitle('  One   Piece  ')).toBe('one piece');
	});
});

describe('findMatchingSeries', () => {
	const seriesList = [
		{ seriesId: 1, name: 'Black Clover', libraryId: 10 },
		{ seriesId: 2, name: 'One Piece', libraryId: 10 },
	];

	test('returns the series whose normalized name matches the normalized title', () => {
		expect(findMatchingSeries({ title: 'black   clover', seriesList })).toEqual({
			seriesId: 1,
			name: 'Black Clover',
			libraryId: 10,
		});
	});

	test('returns null when no series matches', () => {
		expect(
			findMatchingSeries({ title: 'Jujutsu Kaisen', seriesList }),
		).toBeNull();
	});

	test('returns null for an empty series list', () => {
		expect(findMatchingSeries({ title: 'Black Clover', seriesList: [] })).toBeNull();
	});
});

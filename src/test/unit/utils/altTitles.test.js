import { describe, expect, test } from 'vitest';
import { cleanAltTitles, titlesMatch } from '../../../utils/altTitles.js';

describe('cleanAltTitles', () => {
	test('drops empty, duplicate and main-title entries', () => {
		expect(
			cleanAltTitles('Solo Leveling', [
				'',
				'  ',
				'Upando Sozinho',
				'upando sozinho!',
				'SOLO LEVELING',
			]),
		).toEqual(['Upando Sozinho']);
	});

	test('trims kept titles and ignores non-string entries', () => {
		expect(
			cleanAltTitles('A', [' Upando Sozinho ', null, undefined, 7]),
		).toEqual(['Upando Sozinho']);
	});

	test('returns an empty list when there are no candidates', () => {
		expect(cleanAltTitles('A', undefined)).toEqual([]);
	});
});

describe('titlesMatch', () => {
	test('matches the normalized term inside any title', () => {
		expect(titlesMatch('cacador', ['Caçador Suicida'])).toBe(true);
		expect(titlesMatch('upando', ['Solo Leveling', 'Upando Sozinho'])).toBe(
			true,
		);
	});

	test('does not match an absent term', () => {
		expect(titlesMatch('zzz', ['Solo Leveling', 'Upando Sozinho'])).toBe(false);
	});
});

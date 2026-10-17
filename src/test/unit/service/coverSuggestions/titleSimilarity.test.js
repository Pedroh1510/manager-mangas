import { describe, expect, test } from 'vitest';
import {
	bestTitleSimilarity,
	titleSimilarity,
} from '../../../../service/coverSuggestions/titleSimilarity.js';

describe('titleSimilarity', () => {
	test('normalizes and compares by trigrams', () => {
		expect(
			titleSimilarity('Caçador Suicida Rank-SSS', 'cacador suicida rank sss'),
		).toBe(1);
		expect(
			titleSimilarity('Caçador Suicida Rank-SSS', 'Solo Leveling'),
		).toBeLessThan(0.2);
		expect(
			bestTitleSimilarity('Cacador Suicida', ['X', 'Caçador Suicida']),
		).toBe(1);
	});

	test('an empty title scores zero', () => {
		expect(titleSimilarity('', 'Solo Leveling')).toBe(0);
		expect(bestTitleSimilarity('Solo Leveling', [])).toBe(0);
	});
});

import { describe, expect, test } from 'vitest';
import { formatChapters } from '../../../utils/chapterFormat.js';

describe('formatChapters', () => {
	test('keeps only pt/pt-br chapters', () => {
		const chapters = [
			{ title: 'Capítulo 01', language: 'pt' },
			{ title: 'Chapter 01', language: 'en' },
			{ title: 'Capítulo 02', language: 'pt-br' },
		];

		const result = formatChapters(chapters);

		expect(result.map((c) => c.language)).toEqual(['pt', 'pt-br']);
	});

	test('parses the leading chapter number from the title (real Mangeek titles)', () => {
		const result = formatChapters([{ title: 'Capítulo 01', language: 'pt' }]);
		expect(result[0].volume).toBe(1);
	});

	test('truncates a decimal chapter number at the dot (parseInt, not parseFloat)', () => {
		// documents existing behavior, not a bug to fix here
		const result = formatChapters([{ title: 'Capítulo 12.5', language: 'pt' }]);
		expect(result[0].volume).toBe(12);
	});

	test('drops chapters where no number could be parsed from the title', () => {
		const result = formatChapters([{ title: 'Extra', language: 'pt' }]);
		expect(result).toEqual([]);
	});
});

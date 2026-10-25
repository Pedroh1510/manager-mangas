import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { readComicPage } from '../../../../connectors/wicomix/rscPayload.js';

const FIXTURES = new URL('../../../fixtures/wicomix/', import.meta.url);
const readFixture = (name) => readFileSync(new URL(name, FIXTURES), 'utf8');

describe('readComicPage', () => {
	test('reads the comic and chapters from the flight payload', () => {
		const html = readFixture('manga-contrato-de-mercenario.html');

		const { comic, chapters } = readComicPage(html, 'contrato-de-mercenario');

		expect(comic).toEqual({
			title: 'Contrato de Mercenário',
			type: 'manhwa',
			coverUrl:
				'https://picture.mangalivre.org/temp/1786540978812164343_9171d8c4-7268-431d-a4f4-d1d27d70225b.jpg',
			altTitles: ['Mercenary Enrollment'],
		});
		expect(chapters).toHaveLength(281);
		expect(new Set(chapters.map(({ id }) => id)).size).toBe(281);
	});

	test('comic is null when no row carries the slug', () => {
		const html = readFixture('manga-um-verao-sem-fim.html');

		expect(readComicPage(html, 'outra-obra').comic).toBeNull();
	});

	test('inline empty title_alt gives no alt titles', () => {
		const html = readFixture('manga-um-verao-sem-fim.html');

		expect(readComicPage(html, 'um-verao-sem-fim').comic.altTitles).toEqual([]);
	});

	test('a page without flight chunks has no comic and no chapters', () => {
		expect(readComicPage('<html></html>', 'x')).toEqual({
			comic: null,
			chapters: [],
		});
	});
});

import { describe, expect, test } from 'vitest';
import { parseHtmlDocument } from '../../../../connectors/blitztoons/htmlDocument.js';
import {
	isChapterNumber,
	readCatalogCards,
	readChapterItems,
	readPageSources,
} from '../../../../connectors/blitztoons/markup.js';

describe('parseHtmlDocument', () => {
	test('selects nodes and reads attributes, classes and trimmed text', () => {
		const doc = parseHtmlDocument(
			'<ul><li class="a b" data-x="1"> <em>Um</em> </li></ul>',
		);

		const [item] = doc.select('li');

		expect(item.attr('data-x')).toBe('1');
		expect(item.hasClass('b')).toBe(true);
		expect(item.text()).toBe('Um');
		expect(item.select('em')).toHaveLength(1);
	});
});

describe('readCatalogCards', () => {
	test('skips a card whose title link is not an /obra/ path', () => {
		const doc = parseHtmlDocument(
			'<article class="card"><h3 class="card-title"><a href="/vip">VIP</a></h3></article>',
		);

		expect(readCatalogCards(doc)).toEqual([]);
	});
});

describe('readChapterItems', () => {
	test('keeps public items and reads data-num', () => {
		const doc = parseHtmlDocument(
			'<ul class="chaplist"><li class="chap" data-num="7"></li><li class="chap chap-locked" data-num="8"></li></ul>',
		);

		expect(readChapterItems(doc)).toEqual([{ dataNum: '7' }]);
	});
});

describe('isChapterNumber', () => {
	test.each([
		['0', true],
		['164', true],
		['10.5', false],
		['', false],
		['-1', false],
	])('%j -> %s', (dataNum, expected) => {
		expect(isChapterNumber(dataNum)).toBe(expected);
	});
});

describe('readPageSources', () => {
	test('drops images without src', () => {
		const doc = parseHtmlDocument(
			'<img class="page" src=""><img class="page" src="https://cdn.x/1.webp">',
		);

		expect(readPageSources(doc, 'https://blitztoons.com')).toEqual([
			'https://cdn.x/1.webp',
		]);
	});
});

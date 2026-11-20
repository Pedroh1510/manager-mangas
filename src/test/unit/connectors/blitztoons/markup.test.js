import { describe, expect, test } from 'vitest';
import {
	isChapterNumber,
	readCatalogCards,
	readChapterItems,
	readPageSources,
} from '../../../../connectors/blitztoons/markup.js';
import { parseHtmlDocument } from '../../../../connectors/htmlDocument.js';

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
	test('keeps a card whose title link is not an /obra/ path, without slug', () => {
		const doc = parseHtmlDocument(
			'<article class="card"><h3 class="card-title"><a href="/vip">VIP</a></h3></article>',
		);

		expect(readCatalogCards(doc)).toEqual([
			{ slug: undefined, title: 'VIP', coverUrl: '' },
		]);
	});
});

describe('readChapterItems', () => {
	test('keeps public items and reads data-num and publish time', () => {
		const doc = parseHtmlDocument(
			'<ul class="chaplist"><li class="chap" data-num="7"><time datetime="2026-11-19T20:56:25.085Z">há 3 h</time></li><li class="chap chap-locked" data-num="8"></li></ul>',
		);

		expect(readChapterItems(doc)).toEqual([
			{ dataNum: '7', publishedAt: '2026-11-19T20:56:25.085Z' },
		]);
	});

	test('publish time is empty when the item has no time element', () => {
		const doc = parseHtmlDocument(
			'<ul class="chaplist"><li class="chap" data-num="7"></li></ul>',
		);

		expect(readChapterItems(doc)).toEqual([{ dataNum: '7', publishedAt: '' }]);
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

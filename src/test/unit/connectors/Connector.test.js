import { describe, expect, test } from 'vitest';
import Connector from '../../../connectors/Connector.js';

const connector = new Connector({ id: 'x', label: 'X', url: 'http://x' });

describe('Connector._toCatalogEntry', () => {
	test('catalog entry omits empty altTitles', () => {
		const expected = { id: '7', title: 'A', coverUrl: 'u' };
		expect(connector._toCatalogEntry(7, 'A', 'u', [])).toEqual(expected);
		expect(connector._toCatalogEntry(7, 'A', 'u')).toEqual(expected);
	});

	test('catalog entry keeps cleaned altTitles', () => {
		expect(connector._toCatalogEntry(7, 'A', '', ['B', 'b', 'A', ''])).toEqual({
			id: '7',
			title: 'A',
			altTitles: ['B'],
		});
	});
});

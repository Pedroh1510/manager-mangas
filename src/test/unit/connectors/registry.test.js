import { describe, expect, test } from 'vitest';
import Connector from '../../../connectors/Connector.js';
import Mangeek from '../../../connectors/mangeek/Mangeek.js';
import NexusMangas from '../../../connectors/nexusmangas/NexusMangas.js';
import NexusToons from '../../../connectors/nexustoons/NexusToons.js';
import {
	getConnectorClass,
	hasConnector,
	listConnectorIds,
	registerForTests,
} from '../../../connectors/registry.js';

describe('registry', () => {
	test('lists the production connectors', () => {
		expect(listConnectorIds()).toEqual([
			'mangeek',
			'nexustoons',
			'nexusmangas',
			'blitztoons',
		]);
	});

	test('getConnectorClass resolves nexusmangas case-insensitively', () => {
		expect(getConnectorClass('nexusmangas')).toBe(NexusMangas);
		expect(getConnectorClass('NexusMangas')).toBe(NexusMangas);
	});

	test('getConnectorClass resolves nexustoons case-insensitively', () => {
		expect(getConnectorClass('nexustoons')).toBe(NexusToons);
		expect(getConnectorClass('NexusToons')).toBe(NexusToons);
	});

	test('getConnectorClass resolves mangeek case-insensitively', () => {
		expect(getConnectorClass('mangeek')).toBe(Mangeek);
		expect(getConnectorClass('MANGEEK')).toBe(Mangeek);
	});

	test('getConnectorClass throws for an unknown id', () => {
		expect(() => getConnectorClass('leitordemanga')).toThrow(
			'Connector "leitordemanga" not found',
		);
	});

	test('hasConnector is case-insensitive and false for unknown ids', () => {
		expect(hasConnector('Mangeek')).toBe(true);
		expect(hasConnector('leitordemanga')).toBe(false);
	});

	test('registerForTests adds a connector only reachable by the id passed in', () => {
		class Fake extends Connector {
			constructor() {
				super({
					id: 'fake-for-this-test',
					label: 'Fake',
					url: 'http://fake.invalid',
				});
			}
		}

		registerForTests('fake-for-this-test', Fake);

		expect(getConnectorClass('fake-for-this-test')).toBe(Fake);
	});
});

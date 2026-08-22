import { describe, expect, test, vi } from 'vitest';
import Mangeek from '../../../infra/engines/connectors/Mangeek.mjs';

describe('Mangeek', () => {
	describe('metadata', () => {
		test('sets id, label, tags and base url', () => {
			const connector = new Mangeek();
			expect(connector.id).toBe('mangeek');
			expect(connector.label).toBe('Mangeek');
			expect(connector.tags).toEqual(['manga', 'portuguese']);
			expect(connector.url).toBe('http://geekstations.com.br');
		});
	});

	describe('_nonce', () => {
		test('returns the current timestamp as uppercase hex', () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2026-08-22T00:00:00.000Z'));

			const connector = new Mangeek();
			const nonce = connector._nonce();

			expect(nonce).toBe(Date.now().toString(16).toUpperCase());
			expect(nonce).toMatch(/^[0-9A-F]+$/);

			vi.useRealTimers();
		});
	});

	describe('_keyGen', () => {
		test('matches the request-signing formula verified against production (manga id 1968, captured live example from findings.md)', () => {
			const connector = new Mangeek();
			// GET .../manga/1A02B1EAB01/1968/2a09d4c6b42a7efee402ec4db4b6950e
			expect(connector._keyGen('1968')).toBe(
				'2a09d4c6b42a7efee402ec4db4b6950e'
			);
		});

		test('produces a different key for a different param', () => {
			const connector = new Mangeek();
			expect(connector._keyGen('278')).toBe(
				'abbc231f460cba5f8fff4fe1f759f1ed'
			);
			expect(connector._keyGen('278')).not.toBe(connector._keyGen('1968'));
		});
	});
});

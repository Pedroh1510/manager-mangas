import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
	decryptPayload,
	deriveCipherKeys,
	isEncryptedPayload,
} from '../../../../connectors/nexustoons/responseCipher.js';

const FIXTURES = new URL('../../../fixtures/nexustoons/', import.meta.url);
const readFixture = (name) =>
	JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'));

// Secret hardcoded in the site bundle /assets/index-C5k-fnOg.js (2026-10-16).
const SITE_SECRET = 'OrionNexus2025CryptoKey!Secure';

describe('responseCipher', () => {
	const cipherKeys = deriveCipherKeys(SITE_SECRET);

	test('derives five 32-byte keys from the secret', () => {
		expect(cipherKeys).toHaveLength(5);
		for (const { key } of cipherKeys) expect(key).toHaveLength(32);
	});

	test('decrypts a captured chapter response (k=3, v=2) to the known JSON', () => {
		const payload = readFixture('chapter.enc.json');
		expect(decryptPayload(cipherKeys, payload)).toEqual(
			readFixture('chapter.dec.json'),
		);
	});

	test('decrypts a captured 323-chapter manga detail response', () => {
		const payload = readFixture('manga-public.enc.json');
		expect(decryptPayload(cipherKeys, payload)).toEqual(
			readFixture('manga-public.dec.json'),
		);
	});

	test('decrypts an error body returned with k=0', () => {
		// Captured from GET /api/manga/id/725 (401) on 2026-10-16.
		const payload = {
			d: 'Tov0l95hrZVWxqiibVuWBxXL1JjO5JXfgP90iIqhmHq0LrWYRzsnHysZvCJYHj5ZFEw=',
			k: 0,
			v: 2,
		};
		expect(decryptPayload(cipherKeys, payload)).toEqual({
			error: 'Token de autenticação não fornecido',
		});
	});

	test('throws naming the key index when k is out of range', () => {
		expect(() => decryptPayload(cipherKeys, { d: 'AA==', k: 9, v: 2 })).toThrow(
			'key index 9 out of range, expected 0..4',
		);
	});

	test('throws when the wrong secret yields non-JSON bytes', () => {
		const wrongKeys = deriveCipherKeys('not-the-secret');
		expect(() =>
			decryptPayload(wrongKeys, readFixture('chapter.enc.json')),
		).toThrow();
	});

	test('isEncryptedPayload tells encrypted envelopes from plain JSON', () => {
		expect(isEncryptedPayload(readFixture('chapter.enc.json'))).toBe(true);
		expect(isEncryptedPayload(readFixture('catalog-page.json'))).toBe(false);
		expect(isEncryptedPayload(null)).toBe(false);
	});
});

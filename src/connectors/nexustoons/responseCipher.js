import { createHash } from 'node:crypto';

// Port of the site's response cipher (class `Sr`, initFromSecret/decrypt in
// /assets/index-C5k-fnOg.js, 2026-10-16). Responses look like
// {"d":"<base64>","k":<key index>,"v":<version>}.
const KEY_COUNT = 5;
const KEY_LENGTH = 32;

function buildInverseSbox(key) {
	const sbox = Array.from({ length: 256 }, (_, index) => index);
	let swapIndex = 0;
	for (let index = 0; index < 256; index++) {
		swapIndex = (swapIndex + sbox[index] + key[index % KEY_LENGTH]) % 256;
		[sbox[index], sbox[swapIndex]] = [sbox[swapIndex], sbox[index]];
	}
	const inverse = new Array(256);
	sbox.forEach((value, index) => {
		inverse[value] = index;
	});
	return inverse;
}

function rotateRight8(value, shift) {
	return ((value >> shift) | (value << (8 - shift))) & 255;
}

function decryptBytes({ key, inverseSbox }, cipherBytes) {
	const plain = Buffer.alloc(cipherBytes.length);
	for (let c = cipherBytes.length - 1; c >= 0; c--) {
		const previous = c > 0 ? cipherBytes[c - 1] : key[KEY_LENGTH - 1];
		const unboxed = inverseSbox[cipherBytes[c] ^ previous];
		const shift = (((key[(c + 3) % KEY_LENGTH] + (c & 255)) & 255) % 7) + 1;
		plain[c] = rotateRight8(unboxed, shift) ^ key[c % KEY_LENGTH];
	}
	return plain;
}

/**
 * Derives the site's five cipher keys from its bundle secret.
 * @example const keys = deriveCipherKeys('OrionNexus2025CryptoKey!Secure');
 * @param {string} secret
 * @returns {{key: Buffer, inverseSbox: number[]}[]}
 */
export function deriveCipherKeys(secret) {
	return Array.from({ length: KEY_COUNT }, (_, keyIndex) => {
		const key = createHash('sha256')
			.update(`_orion_key_${keyIndex}_v2_${secret}`)
			.digest();
		return { key, inverseSbox: buildInverseSbox(key) };
	});
}

/**
 * True when an API body is an encrypted envelope rather than plain JSON.
 * @example isEncryptedPayload({ d: 'xx', k: 3, v: 2 }) // true
 * @param {unknown} payload
 * @returns {boolean}
 */
export function isEncryptedPayload(payload) {
	return typeof payload?.d === 'string' && payload.v !== undefined;
}

/**
 * Decrypts an envelope into the JSON value it wraps.
 * @example decryptPayload(keys, { d: '...', k: 3, v: 2 }) // { pages: [...] }
 * @param {{key: Buffer, inverseSbox: number[]}[]} cipherKeys
 * @param {{d: string, k?: number, v: number}} payload
 * @returns {unknown}
 */
export function decryptPayload(cipherKeys, payload) {
	const keyIndex = payload.v === 1 ? 0 : payload.k;
	const cipherKey = cipherKeys[keyIndex];
	if (!cipherKey) {
		throw new Error(
			`decryptPayload: key index ${keyIndex} out of range, expected 0..${cipherKeys.length - 1}`,
		);
	}
	const plain = decryptBytes(cipherKey, Buffer.from(payload.d, 'base64'));
	return JSON.parse(plain.toString('utf8'));
}

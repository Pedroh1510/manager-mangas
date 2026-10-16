import { describe, expect, test } from 'vitest';
import {
	findBundlePath,
	findCipherSecret,
} from '../../../../connectors/nexustoons/bundleSecret.js';

describe('bundleSecret', () => {
	test('findBundlePath returns the hashed entry bundle referenced by the shell HTML', () => {
		const html =
			'<script type="module" crossorigin src="/assets/index-C5k-fnOg.js"></script>';
		expect(findBundlePath(html)).toBe('/assets/index-C5k-fnOg.js');
	});

	test('findBundlePath returns null when no entry bundle is referenced', () => {
		expect(findBundlePath('<div id="root"></div>')).toBeNull();
	});

	test('findCipherSecret extracts the literal passed to initFromSecret (minified snippet from 2026-10-16)', () => {
		const bundle =
			'async function _r(){try{const e="OrionNexus2025CryptoKey!Secure";return await Sr.initFromSecret(e),!0}catch(hm){return!1}}';
		expect(findCipherSecret(bundle)).toBe('OrionNexus2025CryptoKey!Secure');
	});

	test('findCipherSecret survives renamed minified identifiers', () => {
		const bundle =
			'const $a="NewSecret2026";return await Xy.initFromSecret($a)';
		expect(findCipherSecret(bundle)).toBe('NewSecret2026');
	});

	test('findCipherSecret returns null when the call is absent', () => {
		expect(findCipherSecret('const e="x";')).toBeNull();
	});
});

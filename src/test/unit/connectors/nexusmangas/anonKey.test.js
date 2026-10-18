import { describe, expect, test } from 'vitest';
import {
	findAnonKey,
	findBundlePath,
} from '../../../../connectors/nexusmangas/anonKey.js';

describe('anonKey', () => {
	test('finds the pages bundle and the anon key', () => {
		const html =
			'<link rel="modulepreload" href="/assets/entries/entry-server-routing.B4lRs1FV.js">' +
			'<link rel="modulepreload" href="/assets/entries/pages.D2BFSKBZ.js" as="script">';
		const bundle =
			'x=1;const $s="https://supabase.nexusmangas.com",La="eyJ0eXAiOiJKV1QifQ.e30.sig-_1";y=2';

		expect(findBundlePath(html)).toBe('/assets/entries/pages.D2BFSKBZ.js');
		expect(findAnonKey(bundle)).toBe('eyJ0eXAiOiJKV1QifQ.e30.sig-_1');
	});

	test('returns null when the shell or bundle no longer match', () => {
		expect(findBundlePath('<script src="/assets/index-A.js">')).toBeNull();
		expect(
			findAnonKey('const url="https://supabase.nexusmangas.com";'),
		).toBeNull();
	});
});

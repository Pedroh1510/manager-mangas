import { describe, expect, test } from 'vitest';
import { findGap } from '../../../service/chapterGap.js';

const keys = (...v) => new Set(v.map(String));

describe('findGap', () => {
	test('holds 177 when highest known integer below is 171', () => {
		expect(findGap({ volume: '177', knownVolumeKeys: keys(170, 171) })).toEqual(
			{ isHeld: true, previousKnownVolume: 171 },
		);
	});

	test('does not hold the next contiguous volume', () => {
		expect(findGap({ volume: 172, knownVolumeKeys: keys(171) }).isHeld).toBe(
			false,
		);
	});

	test('does not hold when nothing is known below', () => {
		expect(findGap({ volume: 5, knownVolumeKeys: keys() })).toEqual({
			isHeld: false,
			previousKnownVolume: null,
		});
		expect(findGap({ volume: 1, knownVolumeKeys: keys(10) }).isHeld).toBe(
			false,
		);
	});

	test('decimal volumes are never held and never fill a gap', () => {
		expect(
			findGap({ volume: '171.5', knownVolumeKeys: keys(100) }).isHeld,
		).toBe(false);
		expect(
			findGap({ volume: 173, knownVolumeKeys: keys(171, '172.5') }),
		).toEqual({ isHeld: true, previousKnownVolume: 171 });
	});
});

import { describe, expect, test } from 'vitest';
import {
	parseImageConversionConcurrency,
	parseImageConversionEnabled,
} from '../../../infra/env.js';

describe('env parsing', () => {
	test('image conversion is enabled unless the value is exactly false', () => {
		expect(parseImageConversionEnabled(undefined)).toBe(true);
		expect(parseImageConversionEnabled('true')).toBe(true);
		expect(parseImageConversionEnabled('0')).toBe(true);
		expect(parseImageConversionEnabled('FALSE')).toBe(true);
		expect(parseImageConversionEnabled('false')).toBe(false);
	});

	test('image conversion concurrency uses a positive integer or the core-based default', () => {
		const cores = 8;
		expect(parseImageConversionConcurrency('3', cores)).toBe(3);
		expect(parseImageConversionConcurrency(undefined, cores)).toBe(7);
		expect(parseImageConversionConcurrency('0', cores)).toBe(7);
		expect(parseImageConversionConcurrency('-1', cores)).toBe(7);
		expect(parseImageConversionConcurrency('abc', cores)).toBe(7);
		expect(parseImageConversionConcurrency(undefined, 1)).toBe(1);
	});
});

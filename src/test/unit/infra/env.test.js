import { describe, expect, test, vi } from 'vitest';
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

	test('title match settings are bounded with defaults', async () => {
		const load = async (vars) => {
			vi.resetModules();
			for (const [name, value] of Object.entries(vars)) vi.stubEnv(name, value);
			const { default: env } = await import('../../../infra/env.js');
			vi.unstubAllEnvs();
			return [
				env.TITLE_MATCH_ENTRY,
				env.TITLE_MATCH_PROMOTE,
				env.TITLE_MATCH_TOP_N,
			];
		};

		expect(await load({})).toEqual([0.9, 0.8, 1]);
		expect(
			await load({
				TITLE_MATCH_ENTRY: '0.95',
				TITLE_MATCH_PROMOTE: '0.7',
				TITLE_MATCH_TOP_N: '2',
			}),
		).toEqual([0.95, 0.7, 2]);
		expect(
			await load({
				TITLE_MATCH_ENTRY: '1.5',
				TITLE_MATCH_PROMOTE: '-0.1',
				TITLE_MATCH_TOP_N: '0',
			}),
		).toEqual([0.9, 0.8, 1]);
	});
});

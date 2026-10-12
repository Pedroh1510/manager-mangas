import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: false,
		include: ['src/**/*.test.js'],
		coverage: {
			provider: 'v8',
			include: ['src/**/*.js'],
			exclude: ['src/**/*.test.js', 'src/test/**'],
			// Floor at the unit line coverage measured on 2026-10-12 (51.69%), rounded down: CI fails on regression.
			thresholds: { lines: 51 }
		},
		testTimeout: 500000,
		pool: 'threads',
		poolOptions: {
			threads: {
				maxThreads: 1,
				minThreads: 1
			}
		}
	}
});

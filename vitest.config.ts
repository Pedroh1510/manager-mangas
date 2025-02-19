import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: false,
		include: ['src/**/*.test.js'],
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

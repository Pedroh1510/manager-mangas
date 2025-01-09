import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: false,
		include: ['src/**/*.test.js'],
		testTimeout: 500000
	}
});

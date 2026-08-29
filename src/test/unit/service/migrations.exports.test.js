import * as nodePgMigrate from 'node-pg-migrate';
import { describe, expect, test } from 'vitest';
import MigrationsService from '../../../service/migrations.js';

describe('node-pg-migrate export shape', () => {
	test('exposes a named "runner" export, not a default export', () => {
		// Regression: v9 dropped the default export migrationRunner used to
		// rely on ("does not provide an export named 'default'" in prod).
		expect(typeof nodePgMigrate.runner).toBe('function');
		expect(nodePgMigrate.default).toBeUndefined();
	});
});

describe('MigrationsService module', () => {
	test('loads without throwing and exposes dryRun/run', () => {
		expect(typeof MigrationsService.dryRun).toBe('function');
		expect(typeof MigrationsService.run).toBe('function');
	});
});

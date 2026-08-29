import { runner as migrationRunner } from 'node-pg-migrate';
import { afterEach, describe, expect, test, vi } from 'vitest';
import database from '../../../infra/database.js';
import MigrationsService from '../../../service/migrations.js';

vi.mock('node-pg-migrate', () => ({
	runner: vi.fn().mockResolvedValue(['20260101000000_init']),
}));
vi.mock('../../../infra/database.js', () => ({
	default: { getNewClient: vi.fn() },
}));

describe('MigrationsService', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('dryRun', () => {
		test('runs the migrations with dryRun true and closes the client', async () => {
			const dbClient = { end: vi.fn() };
			database.getNewClient.mockResolvedValue(dbClient);

			const result = await MigrationsService.dryRun();

			expect(migrationRunner).toHaveBeenCalledWith(
				expect.objectContaining({ dbClient, dryRun: true, direction: 'up' }),
			);
			expect(dbClient.end).toHaveBeenCalledOnce();
			expect(result).toEqual(['20260101000000_init']);
		});

		test('closes the client and rethrows when the runner fails', async () => {
			const dbClient = { end: vi.fn() };
			database.getNewClient.mockResolvedValue(dbClient);
			migrationRunner.mockRejectedValueOnce(new Error('boom'));

			await expect(MigrationsService.dryRun()).rejects.toThrow('boom');
			expect(dbClient.end).toHaveBeenCalledOnce();
		});
	});

	describe('run', () => {
		test('runs the migrations with dryRun false and closes the client', async () => {
			const dbClient = { end: vi.fn() };
			database.getNewClient.mockResolvedValue(dbClient);

			const result = await MigrationsService.run();

			expect(migrationRunner).toHaveBeenCalledWith(
				expect.objectContaining({ dbClient, dryRun: false, direction: 'up' }),
			);
			expect(dbClient.end).toHaveBeenCalledOnce();
			expect(result).toEqual(['20260101000000_init']);
		});
	});
});

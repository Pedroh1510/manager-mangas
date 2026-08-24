import fs from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
	isStale,
	loadCatalog,
	saveCatalog,
} from '../../../utils/mangaCatalog.js';

vi.mock('node:fs/promises');

describe('mangaCatalog', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('loadCatalog', () => {
		test('returns the parsed catalog when the cache file exists', async () => {
			fs.readFile.mockResolvedValue(
				JSON.stringify([{ id: '1', title: 'Black Clover' }]),
			);

			const result = await loadCatalog('mangeek');

			expect(result).toEqual([{ id: '1', title: 'Black Clover' }]);
			expect(fs.readFile).toHaveBeenCalledWith(
				expect.stringContaining('mangas.mangeek.json'),
				'utf8',
			);
		});

		test('returns null when the cache file does not exist', async () => {
			fs.readFile.mockRejectedValue(
				Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
			);

			expect(await loadCatalog('mangeek')).toBeNull();
		});

		test('returns null instead of throwing when the cache file has invalid JSON', async () => {
			fs.readFile.mockResolvedValue('{not valid json');

			expect(await loadCatalog('mangeek')).toBeNull();
		});
	});

	describe('saveCatalog', () => {
		test('creates the cache directory and writes the catalog as JSON', async () => {
			fs.mkdir.mockResolvedValue(undefined);
			fs.writeFile.mockResolvedValue(undefined);

			await saveCatalog('mangeek', [{ id: '1', title: 'Black Clover' }]);

			expect(fs.mkdir).toHaveBeenCalledWith(
				expect.stringContaining('appdata'),
				{
					recursive: true,
				},
			);
			expect(fs.writeFile).toHaveBeenCalledWith(
				expect.stringContaining('mangas.mangeek.json'),
				JSON.stringify([{ id: '1', title: 'Black Clover' }]),
			);
		});
	});

	describe('isStale', () => {
		test('returns true when there is no cache file yet', async () => {
			fs.stat.mockRejectedValue(
				Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
			);

			expect(await isStale('mangeek')).toBe(true);
		});

		test('returns true when the cache file is older than maxAgeMs', async () => {
			const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
			fs.stat.mockResolvedValue({ mtimeMs: eightDaysAgo });

			expect(await isStale('mangeek')).toBe(true);
		});

		test('returns false when the cache file is within maxAgeMs', async () => {
			const oneHourAgo = Date.now() - 60 * 60 * 1000;
			fs.stat.mockResolvedValue({ mtimeMs: oneHourAgo });

			expect(await isStale('mangeek')).toBe(false);
		});

		test('accepts a custom maxAgeMs', async () => {
			const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
			fs.stat.mockResolvedValue({ mtimeMs: twoHoursAgo });

			expect(await isStale('mangeek', 60 * 60 * 1000)).toBe(true);
		});
	});
});

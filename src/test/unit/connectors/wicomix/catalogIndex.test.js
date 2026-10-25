import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createFileIndexStore } from '../../../../connectors/wicomix/catalogIndex.js';

describe('createFileIndexStore', () => {
	let dir;
	let filePath;

	beforeEach(async () => {
		dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wicomix-index-'));
		filePath = path.join(dir, 'wicomix.index.json');
	});

	afterEach(() => fs.rm(dir, { recursive: true, force: true }));

	test('unusable index files load as empty', async () => {
		const store = createFileIndexStore(filePath);
		expect(await store.load()).toEqual({});

		await fs.writeFile(filePath, 'not json');
		expect(await store.load()).toEqual({});

		await fs.writeFile(
			filePath,
			JSON.stringify({ version: 2, entries: { a: { lastmod: 'x' } } }),
		);
		expect(await store.load()).toEqual({});
	});

	test('save writes a temporary file and renames it', async () => {
		const store = createFileIndexStore(filePath);
		const entries = {
			a: { lastmod: '2026-10-24T00:00:00Z', title: 'A', novel: false },
		};
		const renames = [];
		const rename = fs.rename;
		fs.rename = async (from, to) => {
			renames.push([from, to]);
			return rename(from, to);
		};

		try {
			await store.save(entries);
		} finally {
			fs.rename = rename;
		}

		expect(renames).toEqual([[`${filePath}.tmp`, filePath]]);
		expect(JSON.parse(await fs.readFile(filePath, 'utf8'))).toEqual({
			version: 1,
			entries,
		});
		expect(await store.load()).toEqual(entries);
		expect(existsSync(`${filePath}.tmp`)).toBe(false);
	});
});

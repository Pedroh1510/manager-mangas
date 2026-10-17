import { describe, expect, test } from 'vitest';
import { createHashCoverJob } from '../../../../service/coverSuggestions/hashCoverJob.js';
import { createCoverPaths } from '../../../../service/covers/coverPaths.js';
import FakeCatalogCoverHashes from '../../../fakes/FakeCatalogCoverHashes.js';
import FakeClock from '../../../fakes/FakeClock.js';
import FakeCoverStore from '../../../fakes/FakeCoverStore.js';
import FakeLogger from '../../../fakes/FakeLogger.js';

const PLUGIN = 'test-fixture';
const COVER_URL = 'https://img.example/a.jpg';
const paths = createCoverPaths('/root/appdata');
const cachedPath = paths.catalogCover(PLUGIN, 'a');
const COVER = Buffer.from('webp-bytes');
const HASHED = { dHash: -5n, pHash: 7n };
const item = { idPlugin: PLUGIN, idMangaPlugin: 'a', coverUrl: COVER_URL };

function arrange({ files = {}, downloadCover, hashImage, rows = [] } = {}) {
	const store = new FakeCoverStore(files);
	const hashes = new FakeCatalogCoverHashes(rows);
	const logger = new FakeLogger();
	const clock = new FakeClock();
	const downloads = [];
	const slots = [];
	let isInsideSlot = false;
	const hashCover = createHashCoverJob({
		paths,
		store,
		downloadCover: async (url) => {
			downloads.push({ url, isInsideSlot });
			return downloadCover ? downloadCover(url) : COVER;
		},
		withDomainSlot: async (url, task) => {
			slots.push(url);
			isInsideSlot = true;
			try {
				return await task();
			} finally {
				isInsideSlot = false;
			}
		},
		hashImage: hashImage ?? (async () => HASHED),
		hashes,
		now: clock.now,
		logger,
	});
	return { hashCover, store, hashes, logger, clock, downloads, slots };
}

describe('hashCover job', () => {
	test('hashes the cached catalog cover without downloading', async () => {
		const seen = [];
		const { hashCover, downloads, hashes } = arrange({
			files: { [cachedPath]: COVER },
			hashImage: async (image) => {
				seen.push(image);
				return HASHED;
			},
		});

		await hashCover(item);

		expect(downloads).toEqual([]);
		expect(seen).toEqual([COVER]);
		expect(hashes.row(PLUGIN, 'a')).toMatchObject(HASHED);
	});

	test('downloads inside the domain slot and stores the cover', async () => {
		const { hashCover, slots, downloads, store, hashes, clock } = arrange();

		await hashCover(item);

		expect(slots).toEqual([COVER_URL]);
		expect(downloads).toEqual([{ url: COVER_URL, isInsideSlot: true }]);
		expect(await store.read(cachedPath)).toEqual(COVER);
		expect(hashes.row(PLUGIN, 'a')).toMatchObject({
			coverUrl: COVER_URL,
			dHash: -5n,
			pHash: 7n,
			failureCount: 0,
			failedAt: null,
			hashedAt: new Date(clock.now()),
		});
	});

	test('records a failed hash and logs it', async () => {
		const failures = [
			{
				name: 'download rejects',
				downloadCover: async () => {
					throw new Error('404');
				},
			},
			{
				name: 'sharp cannot decode',
				hashImage: async () => {
					throw new Error('unsupported image format');
				},
			},
		];
		for (const failure of failures) {
			const { hashCover, hashes, logger, clock } = arrange({
				...failure,
				rows: [
					{
						...item,
						dHash: null,
						pHash: null,
						failureCount: 2,
						failedAt: new Date(0),
					},
				],
			});

			await expect(hashCover(item), failure.name).resolves.toBeUndefined();

			expect(hashes.row(PLUGIN, 'a'), failure.name).toMatchObject({
				dHash: null,
				pHash: null,
				failureCount: 3,
				failedAt: new Date(clock.now()),
			});
			expect(logger.warnings, failure.name).toEqual([
				{
					status: 'hash_capa_falhou',
					idPlugin: PLUGIN,
					idMangaPlugin: 'a',
					coverUrl: COVER_URL,
					error: expect.any(String),
				},
			]);
		}
	});
});

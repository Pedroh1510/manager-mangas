import { afterAll, describe, expect, test } from 'vitest';
import { hashJobId } from '../../../service/coverSuggestions/indexSync.js';
import { getCoverHashQueue } from '../../../service/queue/coverHashQueue.js';

const PLUGIN = 'test-fixture';
const queue = getCoverHashQueue(PLUGIN);

afterAll(async () => {
	await queue.obliterate({ force: true });
	await queue.close();
});

describe('cover hash queue on Redis', () => {
	test('deduplicates a hashCover job per item', async () => {
		await queue.obliterate({ force: true });
		const data = { idPlugin: PLUGIN, idMangaPlugin: 'dup', coverUrl: 'https://img.example/dup.jpg' };
		const opts = { jobId: hashJobId(PLUGIN, 'dup') };

		await queue.add('hashCover', data, opts);
		await queue.add('hashCover', data, opts);

		const counts = await queue.getJobCounts();
		const jobs = Object.values(counts).reduce((sum, count) => sum + count, 0);
		expect(jobs, JSON.stringify(counts)).toBe(1);
	});
});

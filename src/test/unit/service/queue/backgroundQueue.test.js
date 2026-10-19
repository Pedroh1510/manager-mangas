import { afterEach, describe, expect, test, vi } from 'vitest';

const upsertJobSchedulerMock = vi.fn();
const queueAddMock = vi.fn();
vi.mock('bullmq', () => ({
	Queue: vi.fn().mockImplementation(() => ({
		add: queueAddMock,
		upsertJobScheduler: upsertJobSchedulerMock,
	})),
	Worker: vi.fn(),
}));
vi.mock('../../../../service/mangaAdmin.js', () => ({
	default: {
		updateMangas: vi.fn(),
		updateMangaChapters: vi.fn(),
		downloadMangasBatch: vi.fn(),
		listPagesAndSend: vi.fn(),
	},
}));
vi.mock('../../../../service/kavita/cleanupReadChapters.js', () => ({
	default: { cleanupReadChapters: vi.fn() },
}));
vi.mock('../../../../service/queue/connection.js', () => ({ default: {} }));
vi.mock('../../../../service/coverSuggestions/index.js', () => ({
	default: {
		syncAllIndexes: vi.fn(),
		matchAll: vi.fn(),
		matchMangaSuggestions: vi.fn(),
	},
}));
vi.mock('../../../../service/altTitles.js', () => ({
	default: { backfill: vi.fn() },
}));

const {
	enqueueBackgroundTask,
	scheduleRecurringCleanup,
	scheduleRecurringCoverIndexSync,
	scheduleRecurringCoverMatching,
	startBackgroundWorker,
} = await import('../../../../service/queue/backgroundQueue.js');
const { Worker } = await import('bullmq');
const CoverSuggestions = (
	await import('../../../../service/coverSuggestions/index.js')
).default;
const AltTitlesService = (await import('../../../../service/altTitles.js'))
	.default;

function backgroundProcessor() {
	startBackgroundWorker();
	return vi.mocked(Worker).mock.calls.at(-1)[1];
}

describe('backgroundQueue Kavita cleanup wiring', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		upsertJobSchedulerMock.mockReset();
		queueAddMock.mockReset();
	});

	test('scheduleRecurringCleanup registers the every-6h scheduler for cleanupReadChapters', async () => {
		await scheduleRecurringCleanup();

		expect(upsertJobSchedulerMock).toHaveBeenCalledWith(
			'kavita-cleanup-every-6h',
			{ pattern: '0 2,8,14,20 * * *' },
			{ name: 'cleanupReadChapters' },
		);
	});

	test('enqueueBackgroundTask accepts the cleanupReadChapters operation name', async () => {
		await enqueueBackgroundTask('cleanupReadChapters', { idManga: 1 }, 'job-1');

		expect(queueAddMock).toHaveBeenCalledWith(
			'cleanupReadChapters',
			{ idManga: 1 },
			{
				attempts: 10,
				backoff: { type: 'exponential', delay: 30000 },
				jobId: 'job-1',
			},
		);
	});

	test('schedules the daily cover hash index sync for every connector', async () => {
		await scheduleRecurringCoverIndexSync();
		await backgroundProcessor()({ name: 'syncCoverHashIndex', data: {} });

		expect(upsertJobSchedulerMock).toHaveBeenCalledWith(
			'cover-index-sync-daily',
			{ pattern: '0 3 * * *' },
			{ name: 'syncCoverHashIndex' },
		);
		expect(CoverSuggestions.syncAllIndexes).toHaveBeenCalledTimes(1);
	});

	test('schedules cover matching at 11:30 and 19:30', async () => {
		await scheduleRecurringCoverMatching();
		await backgroundProcessor()({ name: 'matchCoverSuggestions', data: {} });

		expect(upsertJobSchedulerMock).toHaveBeenCalledWith(
			'cover-matching-every-12h',
			{ pattern: '30 11,19 * * *' },
			{ name: 'matchCoverSuggestions' },
		);
		expect(CoverSuggestions.matchAll).toHaveBeenCalledTimes(1);
	});

	test('registers backfillAltTitles and matchMangaSuggestions', async () => {
		const processJob = backgroundProcessor();

		await processJob({
			name: 'backfillAltTitles',
			data: { idPlugin: 'nexustoons' },
		});
		await processJob({ name: 'matchMangaSuggestions', data: { idManga: 7 } });

		expect(AltTitlesService.backfill).toHaveBeenCalledWith({
			idPlugin: 'nexustoons',
		});
		expect(CoverSuggestions.matchMangaSuggestions).toHaveBeenCalledWith({
			idManga: 7,
		});
	});
});

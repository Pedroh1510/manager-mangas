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

const {
	enqueueBackgroundTask,
	scheduleRecurringCleanup,
} = await import('../../../../service/queue/backgroundQueue.js');

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
			{ attempts: 100, jobId: 'job-1' },
		);
	});
});

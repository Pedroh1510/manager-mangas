import { afterEach, describe, expect, test, vi } from 'vitest';

const QueueMock = vi.fn().mockImplementation(function Queue() {});
const WorkerMock = vi.fn();

vi.mock('bullmq', () => ({
	Queue: QueueMock,
	Worker: WorkerMock,
}));
vi.mock('../../../../service/manga.js', () => ({
	default: { downloadMangas: vi.fn() },
}));

const { processDownloadJob } = await import(
	'../../../../service/queue/downloadQueue.js'
);
const { PageNotFoundError } = await import(
	'../../../../service/imageDownloader.js'
);
const MangaService = (await import('../../../../service/manga.js')).default;

describe('processDownloadJob', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	function fakeJob(data = {}) {
		return { data, discard: vi.fn() };
	}

	test('downloads the chapter using the job data', async () => {
		MangaService.downloadMangas.mockResolvedValue(undefined);
		const job = fakeJob({
			manga: 'Test Manga',
			chapter: 1,
			pages: ['a'],
			idChapter: 'c1',
		});

		await processDownloadJob(job);

		expect(MangaService.downloadMangas).toHaveBeenCalledWith({
			manga: 'Test Manga',
			chapter: 1,
			pages: ['a'],
			idChapter: 'c1',
		});
		expect(job.discard).not.toHaveBeenCalled();
	});

	test('discards the job and rethrows when a page 404s, so it is not retried', async () => {
		const error = new PageNotFoundError('https://a.example/missing.jpg');
		MangaService.downloadMangas.mockRejectedValue(error);
		const job = fakeJob();

		await expect(processDownloadJob(job)).rejects.toThrow(PageNotFoundError);
		expect(job.discard).toHaveBeenCalledTimes(1);
	});

	test('does not discard the job for a transient error, so BullMQ retries it', async () => {
		const error = new Error('network down');
		MangaService.downloadMangas.mockRejectedValue(error);
		const job = fakeJob();

		await expect(processDownloadJob(job)).rejects.toThrow('network down');
		expect(job.discard).not.toHaveBeenCalled();
	});
});

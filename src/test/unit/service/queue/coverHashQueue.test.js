import { afterEach, describe, expect, test, vi } from 'vitest';

const WorkerMock = vi.fn();
vi.mock('bullmq', () => ({
	Queue: vi.fn().mockImplementation(function Queue(name) {
		this.name = name;
	}),
	Worker: WorkerMock,
}));
vi.mock('../../../../service/queue/connection.js', () => ({ default: {} }));
vi.mock('../../../../connectors/registry.js', () => ({
	listConnectorIds: vi.fn().mockReturnValue(['test-fixture', 'mangeek']),
}));

async function startWorkers() {
	const { startCoverHashWorkers } = await import(
		'../../../../service/queue/coverHashQueue.js'
	);
	return startCoverHashWorkers(vi.fn());
}

describe('coverHashQueue', () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	test('creates one rate limited worker per connector', async () => {
		const workers = await startWorkers();

		expect(workers).toHaveLength(2);
		expect(WorkerMock).toHaveBeenCalledWith(
			'cover-hash-test-fixture',
			expect.any(Function),
			expect.objectContaining({
				concurrency: 1,
				limiter: { max: 1, duration: 1000 },
			}),
		);
		expect(WorkerMock).toHaveBeenCalledWith(
			'cover-hash-mangeek',
			expect.any(Function),
			expect.any(Object),
		);

		vi.clearAllMocks();
		vi.resetModules();
		vi.stubEnv('COVER_HASH_RATE_PER_SEC', '3');
		await startWorkers();

		expect(WorkerMock.mock.calls[0][2].limiter).toEqual({
			max: 3,
			duration: 1000,
		});
	});

	test('the worker hands the job data to hashCover', async () => {
		const { startCoverHashWorkers } = await import(
			'../../../../service/queue/coverHashQueue.js'
		);
		const hashCover = vi.fn();
		startCoverHashWorkers(hashCover);

		await WorkerMock.mock.calls[0][1]({ data: { idMangaPlugin: 'a' } });

		expect(hashCover).toHaveBeenCalledWith({ idMangaPlugin: 'a' });
	});
});

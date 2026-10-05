import { afterEach, describe, expect, test, vi } from 'vitest';

const addMock = vi.fn();
const waitUntilFinishedMock = vi.fn();
const QueueMock = vi.fn().mockImplementation(function Queue(name) {
	this.name = name;
	this.add = addMock;
});
const QueueEventsMock = vi.fn();
const WorkerMock = vi.fn();

vi.mock('bullmq', () => ({
	Queue: QueueMock,
	QueueEvents: QueueEventsMock,
	Worker: WorkerMock,
}));

vi.mock('../../../../utils/mangaCatalog.js', () => ({
	saveCatalog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../connectors/registry.js', () => ({
	getConnectorClass: vi.fn().mockReturnValue(
		class MockConnector {
			async initialize() {}
		},
	),
	listConnectorIds: vi.fn().mockReturnValue(['mangeek']),
}));

describe('connectorQueue', () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	test('getConnectorQueue names the queue "connector-<id>" and reuses the same instance', async () => {
		const { getConnectorQueue } = await import(
			'../../../../service/queue/connectorQueue.js'
		);

		const first = getConnectorQueue('mangeek');
		const second = getConnectorQueue('mangeek');

		expect(QueueMock).toHaveBeenCalledTimes(1);
		expect(QueueMock).toHaveBeenCalledWith(
			'connector-mangeek',
			expect.any(Object),
		);
		expect(first).toBe(second);
	});

	test('enqueueAndWait adds a job with the operation as its name and waits for it', async () => {
		addMock.mockResolvedValue({
			waitUntilFinished: waitUntilFinishedMock.mockResolvedValue(['result']),
		});
		const { enqueueAndWait } = await import(
			'../../../../service/queue/connectorQueue.js'
		);

		const result = await enqueueAndWait('mangeek', 'listMangas', {
			foo: 'bar',
		});

		expect(addMock).toHaveBeenCalledWith(
			'listMangas',
			{ foo: 'bar' },
			{ attempts: 3 },
		);
		expect(result).toEqual(['result']);
	});

	test('startConnectorWorkers creates one Worker per registered connector', async () => {
		const { startConnectorWorkers } = await import(
			'../../../../service/queue/connectorQueue.js'
		);

		const workers = startConnectorWorkers();

		expect(WorkerMock).toHaveBeenCalledTimes(1);
		expect(WorkerMock).toHaveBeenCalledWith(
			'connector-mangeek',
			expect.any(Function),
			expect.objectContaining({ concurrency: 1 }),
		);
		expect(workers).toHaveLength(1);
	});

	describe('refreshCatalog operation', () => {
		class FakeCatalogConnector {
			constructor() {
				this.id = 'mangeek';
			}

			async initialize() {}

			async _getMangas() {
				return FakeCatalogConnector.mangas;
			}
		}

		async function runRefreshCatalogJob() {
			const registry = await import('../../../../connectors/registry.js');
			vi.mocked(registry.getConnectorClass).mockReturnValue(
				FakeCatalogConnector,
			);
			const { startConnectorWorkers } = await import(
				'../../../../service/queue/connectorQueue.js'
			);
			startConnectorWorkers();
			const processJob = WorkerMock.mock.calls[0][1];
			return processJob({ name: 'refreshCatalog', data: {} });
		}

		test("refreshCatalog saves the connector's list to the catalog", async () => {
			FakeCatalogConnector.mangas = [{ id: '1', title: 'Black Clover' }];
			const { saveCatalog } = await import('../../../../utils/mangaCatalog.js');

			await runRefreshCatalogJob();

			expect(saveCatalog).toHaveBeenCalledWith('mangeek', [
				{ id: '1', title: 'Black Clover' },
			]);
		});

		test('refreshCatalog rejects an empty list and keeps the catalog', async () => {
			FakeCatalogConnector.mangas = [];
			const { saveCatalog } = await import('../../../../utils/mangaCatalog.js');

			await expect(runRefreshCatalogJob()).rejects.toThrow('mangeek');
			expect(saveCatalog).not.toHaveBeenCalled();
		});
	});

	test('enqueueCatalogRefresh adds a deduplicated refreshCatalog job', async () => {
		addMock.mockResolvedValue({});
		const { enqueueCatalogRefresh } = await import(
			'../../../../service/queue/connectorQueue.js'
		);

		await enqueueCatalogRefresh('mangeek');

		expect(addMock).toHaveBeenCalledWith(
			'refreshCatalog',
			{},
			{ attempts: 3, deduplication: { id: 'catalog-mangeek' } },
		);
	});
});

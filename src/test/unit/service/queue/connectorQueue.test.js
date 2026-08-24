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
});

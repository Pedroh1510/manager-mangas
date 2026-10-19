import { afterEach, describe, expect, test, vi } from 'vitest';
import { createCoverPaths } from '../../../../service/covers/coverPaths.js';
import FakeCoverStore from '../../../fakes/FakeCoverStore.js';

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
	CATALOG_VERSION: 3,
	saveCatalog: vi.fn().mockResolvedValue(undefined),
	loadCatalog: vi.fn().mockResolvedValue(null),
	readCatalogVersion: vi.fn().mockResolvedValue(3),
}));

vi.mock('../../../../service/queue/backgroundQueue.js', () => ({
	enqueueBackgroundTask: vi.fn().mockResolvedValue(undefined),
}));

// The real cover service over an in-memory store, so the assertions read
// which cover files survive a refresh.
const covers = vi.hoisted(() => ({ store: null }));
vi.mock('../../../../service/covers/index.js', async () => {
	const { createCoverService } = await import(
		'../../../../service/covers/coverService.js'
	);
	const { createCoverPaths } = await import(
		'../../../../service/covers/coverPaths.js'
	);
	return {
		default: createCoverService({
			paths: createCoverPaths('/root/appdata'),
			store: {
				read: (filePath) => covers.store.read(filePath),
				write: (filePath, image) => covers.store.write(filePath, image),
				remove: (filePath) => covers.store.remove(filePath),
			},
		}),
	};
});

// Records the index sync refreshCatalog triggers, in call order with the
// catalog save, so the tests can tell "after saving" from "instead of".
const calls = vi.hoisted(() => ({ order: [] }));
vi.mock('../../../../service/coverSuggestions/index.js', () => ({
	default: {
		syncConnectorIndex: vi.fn(async (id) => {
			calls.order.push(`sync:${id}`);
			calls.coverFilesAtSync = covers.store?.paths().toSorted();
		}),
	},
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

	test('nexusmangas worker runs with concurrency 1', async () => {
		const registry = await import('../../../../connectors/registry.js');
		registry.listConnectorIds.mockReturnValueOnce(['nexusmangas']);
		const { startConnectorWorkers } = await import(
			'../../../../service/queue/connectorQueue.js'
		);

		startConnectorWorkers();

		expect(WorkerMock).toHaveBeenCalledWith(
			'connector-nexusmangas',
			expect.any(Function),
			expect.objectContaining({ concurrency: 1 }),
		);
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

		const coverPaths = createCoverPaths('/root/appdata');
		const catalogCover = (id) => coverPaths.catalogCover('mangeek', id);
		const localCover = coverPaths.localCover(7);
		const LOCAL_BYTES = Buffer.from('local-7');

		async function arrangeCoverFiles() {
			covers.store = new FakeCoverStore({
				[catalogCover('a')]: Buffer.from('a'),
				[catalogCover('b')]: Buffer.from('b'),
				[catalogCover('c')]: Buffer.from('c'),
				[localCover]: LOCAL_BYTES,
			});
			const { loadCatalog } = await import('../../../../utils/mangaCatalog.js');
			vi.mocked(loadCatalog).mockResolvedValue([
				{ id: 'a', title: 'A', coverUrl: 'https://h/a.jpg' },
				{ id: 'b', title: 'B', coverUrl: 'https://h/b.jpg' },
				{ id: 'c', title: 'C', coverUrl: 'https://h/c.jpg' },
			]);
		}

		const nextCatalog = [
			{ id: 'a', title: 'A', coverUrl: 'https://h/a.jpg' },
			{ id: 'b', title: 'B', coverUrl: 'https://h/b-new.jpg' },
		];

		test('refreshCatalog drops cover files of removed ids and changed cover urls', async () => {
			await arrangeCoverFiles();
			FakeCatalogConnector.mangas = nextCatalog;

			await runRefreshCatalogJob();

			const catalogFiles = covers.store
				.paths()
				.filter((filePath) => filePath.includes('covers-catalog'));
			expect(catalogFiles).toEqual([catalogCover('a')]);
		});

		test('refreshCatalog keeps cover files when the scrape is empty', async () => {
			await arrangeCoverFiles();
			FakeCatalogConnector.mangas = [];

			await expect(runRefreshCatalogJob()).rejects.toThrow('mangeek');

			expect(covers.store.paths().toSorted()).toEqual(
				[
					catalogCover('a'),
					catalogCover('b'),
					catalogCover('c'),
					localCover,
				].toSorted(),
			);
		});

		test('refreshCatalog drops stale covers, saves, then enqueues the index sync', async () => {
			await arrangeCoverFiles();
			FakeCatalogConnector.mangas = nextCatalog;
			calls.order = [];
			const { saveCatalog } = await import('../../../../utils/mangaCatalog.js');
			vi.mocked(saveCatalog).mockImplementation(async (id) => {
				calls.order.push(`save:${id}`);
				calls.coverFilesAtSave = covers.store.paths().toSorted();
			});
			const { enqueueBackgroundTask } = await import(
				'../../../../service/queue/backgroundQueue.js'
			);
			vi.mocked(enqueueBackgroundTask).mockImplementation(
				async (name, data) => {
					calls.order.push(`${name}:${data.idPlugin}`);
				},
			);

			await runRefreshCatalogJob();
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(calls.order).toEqual([
				'save:mangeek',
				'syncConnectorCoverIndex:mangeek',
			]);
			// The catalog file is the job's last write: the index sync runs in its
			// own background job, so the refresh dedup key is released right away.
			expect(calls.coverFilesAtSave).toEqual(
				[catalogCover('a'), localCover].toSorted(),
			);
		});

		test('refreshCatalog does not sync the index on an empty scrape', async () => {
			await arrangeCoverFiles();
			FakeCatalogConnector.mangas = [];
			const { enqueueBackgroundTask } = await import(
				'../../../../service/queue/backgroundQueue.js'
			);

			await expect(runRefreshCatalogJob()).rejects.toThrow('mangeek');
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(enqueueBackgroundTask).not.toHaveBeenCalled();
		});

		test('refreshCatalog never touches local manga covers', async () => {
			await arrangeCoverFiles();
			FakeCatalogConnector.mangas = nextCatalog;

			await runRefreshCatalogJob();

			expect(await covers.store.read(localCover)).toEqual(LOCAL_BYTES);
		});

		async function refreshFromVersion(previousVersion) {
			FakeCatalogConnector.mangas = [{ id: '1', title: 'Black Clover' }];
			const { readCatalogVersion } = await import(
				'../../../../utils/mangaCatalog.js'
			);
			vi.mocked(readCatalogVersion).mockResolvedValue(previousVersion);
			const { enqueueBackgroundTask } = await import(
				'../../../../service/queue/backgroundQueue.js'
			);
			await runRefreshCatalogJob();
			// The backfill enqueue is fire-and-forget; let it settle.
			await new Promise((resolve) => setTimeout(resolve, 0));
			return vi
				.mocked(enqueueBackgroundTask)
				.mock.calls.filter(([name]) => name === 'backfillAltTitles');
		}

		test('upgrade to catalog v3 enqueues the alt titles backfill', async () => {
			for (const previousVersion of [null, 2]) {
				vi.clearAllMocks();
				expect(await refreshFromVersion(previousVersion)).toEqual([
					[
						'backfillAltTitles',
						{ idPlugin: 'mangeek' },
						'backfill-alt-titles-mangeek',
					],
				]);
			}
		});

		test('v3 to v3 refresh does not enqueue the backfill', async () => {
			expect(await refreshFromVersion(3)).toEqual([]);
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

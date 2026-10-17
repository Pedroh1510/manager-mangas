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
	saveCatalog: vi.fn().mockResolvedValue(undefined),
	loadCatalog: vi.fn().mockResolvedValue(null),
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

		test('refreshCatalog syncs the cover hash index after saving', async () => {
			await arrangeCoverFiles();
			FakeCatalogConnector.mangas = nextCatalog;
			calls.order = [];
			const { saveCatalog } = await import('../../../../utils/mangaCatalog.js');
			vi.mocked(saveCatalog).mockImplementation(async (id) => {
				calls.order.push(`save:${id}`);
			});

			await runRefreshCatalogJob();

			expect(calls.order).toEqual(['save:mangeek', 'sync:mangeek']);
		});

		test('refreshCatalog does not sync the index on an empty scrape', async () => {
			await arrangeCoverFiles();
			FakeCatalogConnector.mangas = [];
			const CoverSuggestions = (
				await import('../../../../service/coverSuggestions/index.js')
			).default;

			await expect(runRefreshCatalogJob()).rejects.toThrow('mangeek');

			expect(CoverSuggestions.syncConnectorIndex).not.toHaveBeenCalled();
		});

		test('refreshCatalog never touches local manga covers', async () => {
			await arrangeCoverFiles();
			FakeCatalogConnector.mangas = nextCatalog;

			await runRefreshCatalogJob();

			expect(await covers.store.read(localCover)).toEqual(LOCAL_BYTES);
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

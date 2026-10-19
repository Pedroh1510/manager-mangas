import { describe, expect, test } from 'vitest';
import { createAltTitlesService } from '../../../service/altTitles.js';
import FakeAltTitlesStore from '../../fakes/FakeAltTitlesStore.js';
import FakeBackgroundQueue from '../../fakes/FakeBackgroundQueue.js';
import FakeCatalogs from '../../fakes/FakeCatalogs.js';

const soloLeveling = () => ({
	idManga: 1,
	title: 'Solo Leveling',
	altTitles: ['Na Honjaman'],
});

const ntCatalog = [
	{ id: 'solo', title: 'Solo Leveling', altTitles: ['Upando Sozinho'] },
];

const ntLink = {
	idManga: 1,
	idPlugin: 'nexustoons',
	idMangaPlugin: 'solo',
	titlePlugin: 'Solo Leveling NT',
};

function build({ mangas = [soloLeveling()], links = [], catalogs = {} } = {}) {
	const store = new FakeAltTitlesStore(mangas, links);
	const catalog = new FakeCatalogs(catalogs);
	const queue = new FakeBackgroundQueue();
	const service = createAltTitlesService({
		mangas: store,
		links: store,
		loadCatalog: catalog.load,
		enqueue: queue.enqueue,
	});
	return { service, store, catalog, queue };
}

describe('AltTitlesService.mergeFromLink', () => {
	test('link merges titlePlugin and catalog alternative titles', async () => {
		const { service, store } = build({ catalogs: { nexustoons: ntCatalog } });

		await service.mergeFromLink(ntLink);

		expect((await store.findMangaById({ idManga: 1 })).altTitles).toEqual([
			'Na Honjaman',
			'Solo Leveling NT',
			'Upando Sozinho',
		]);
	});

	test('link without catalog item merges only titlePlugin', async () => {
		const missingCatalog = build();
		await missingCatalog.service.mergeFromLink(ntLink);
		const missingItem = build({ catalogs: { nexustoons: [] } });
		await missingItem.service.mergeFromLink(ntLink);

		for (const { store } of [missingCatalog, missingItem]) {
			expect((await store.findMangaById({ idManga: 1 })).altTitles).toEqual([
				'Na Honjaman',
				'Solo Leveling NT',
			]);
		}
	});

	test('link merge reads only the linked connector catalog', async () => {
		const { service, catalog } = build({
			links: [
				{ ...ntLink, idPlugin: 'mangeek', idMangaPlugin: 'm' },
				{ ...ntLink, idPlugin: 'nexusmangas', idMangaPlugin: 'n' },
			],
			catalogs: { nexustoons: ntCatalog, mangeek: [], nexusmangas: [] },
		});

		await service.mergeFromLink(ntLink);

		expect(catalog.reads).toEqual(['nexustoons']);
	});

	test('altTitles writes enqueue matching for the manga', async () => {
		const linked = build({ catalogs: { nexustoons: ntCatalog } });
		await linked.service.mergeFromLink(ntLink);
		const patched = build();
		await patched.service.replace({ idManga: 1, altTitles: ['X Y'] });

		for (const { queue } of [linked, patched]) {
			expect(queue.jobs).toEqual([
				{
					operation: 'matchMangaSuggestions',
					data: { idManga: 1 },
					jobId: 'match-manga-1',
				},
			]);
		}
	});

	test('a link that adds no new title neither writes nor enqueues', async () => {
		const { service, store, queue } = build({
			mangas: [{ ...soloLeveling(), altTitles: ['Solo Leveling NT'] }],
		});

		await service.mergeFromLink(ntLink);

		expect(store.writes).toBe(0);
		expect(queue.jobs).toEqual([]);
	});
});

describe('AltTitlesService.replace', () => {
	test('replaces the list cleaned against the main title', async () => {
		const { service } = build();

		const result = await service.replace({
			idManga: 1,
			altTitles: ['Upando Sozinho', ' upando  sozinho ', 'Solo Leveling'],
		});

		expect(result).toEqual({
			idManga: 1,
			title: 'Solo Leveling',
			altTitles: ['Upando Sozinho'],
		});
	});

	test('rejects with NotFoundError naming the manga when it is missing or deleted', async () => {
		const { service } = build({
			mangas: [{ ...soloLeveling(), deletedAt: new Date() }],
		});

		await expect(
			service.replace({ idManga: 1, altTitles: [] }),
		).rejects.toMatchObject({ statusCode: 404, message: 'Manga 1 not found' });
		await expect(
			service.replace({ idManga: 2, altTitles: [] }),
		).rejects.toMatchObject({ statusCode: 404, message: 'Manga 2 not found' });
	});
});

describe('AltTitlesService.backfill', () => {
	const twoMangas = () => [
		soloLeveling(),
		{ idManga: 2, title: 'Caçador Suicida', altTitles: [] },
	];
	const twoLinks = [
		ntLink,
		{
			idManga: 2,
			idPlugin: 'nexustoons',
			idMangaPlugin: 'cacador',
			titlePlugin: 'Cacador Suicida Rank SSS',
		},
		{ ...ntLink, idManga: 2, idPlugin: 'mangeek', titlePlugin: 'Outro' },
	];
	const catalogs = {
		nexustoons: [
			...ntCatalog,
			{ id: 'cacador', title: 'C', altTitles: ['Suicide Hunter'] },
		],
	};

	test('backfill merges every link of the connector then enqueues matching', async () => {
		const { service, store, queue } = build({
			mangas: twoMangas(),
			links: twoLinks,
			catalogs,
		});

		await service.backfill({ idPlugin: 'nexustoons' });

		expect((await store.findMangaById({ idManga: 1 })).altTitles).toEqual([
			'Na Honjaman',
			'Solo Leveling NT',
			'Upando Sozinho',
		]);
		expect((await store.findMangaById({ idManga: 2 })).altTitles).toEqual([
			'Cacador Suicida Rank SSS',
			'Suicide Hunter',
		]);
		expect(queue.jobs).toEqual([
			{
				operation: 'matchCoverSuggestions',
				data: {},
				jobId: 'match-after-alt-backfill',
			},
		]);
	});

	test('backfill is idempotent', async () => {
		const { service, store } = build({
			mangas: twoMangas(),
			links: twoLinks,
			catalogs,
		});

		await service.backfill({ idPlugin: 'nexustoons' });
		const first = [...store.mangas.values()];
		await service.backfill({ idPlugin: 'nexustoons' });

		expect([...store.mangas.values()]).toEqual(first);
	});
});

import { describe, expect, test, vi } from 'vitest';

const loadCatalogMock = vi.fn().mockResolvedValue(null);
vi.mock('../../../../utils/mangaCatalog.js', () => ({
	loadCatalog: loadCatalogMock,
}));
vi.mock('../../../../connectors/registry.js', () => ({
	listConnectorIds: vi.fn().mockReturnValue(['mangeek', 'nexustoons']),
}));
vi.mock('../../../../service/queue/coverHashQueue.js', () => ({
	getCoverHashQueue: vi.fn(),
}));
vi.mock('../../../../infra/database.js', () => ({
	default: { query: vi.fn() },
}));

const { default: CoverSuggestions } = await import(
	'../../../../service/coverSuggestions/index.js'
);
const { createMangaMatchJob } = await import(
	'../../../../service/coverSuggestions/mangaMatchJob.js'
);

describe('CoverSuggestions wiring', () => {
	test('syncAllIndexes syncs every registered connector', async () => {
		await CoverSuggestions.syncAllIndexes();

		expect(loadCatalogMock.mock.calls.map(([id]) => id)).toEqual([
			'mangeek',
			'nexustoons',
		]);
	});
});

describe('matchMangaSuggestions', () => {
	const mangaRow = (overrides) => ({
		idManga: 7,
		title: 'Solo Leveling',
		altTitles: ['Upando Sozinho'],
		deletedAt: null,
		...overrides,
	});

	function build(manga) {
		const matched = [];
		const job = createMangaMatchJob({
			findMangaById: async ({ idManga }) =>
				manga?.idManga === idManga ? manga : null,
			matchManga: async (args) => {
				matched.push(args);
				return [];
			},
		});
		return { job, matched };
	}

	test('matchMangaSuggestions loads the manga titles', async () => {
		const { job, matched } = build(mangaRow());

		await job({ idManga: 7 });

		expect(matched).toEqual([
			{ idManga: 7, title: 'Solo Leveling', altTitles: ['Upando Sozinho'] },
		]);
	});

	test('skips a missing or deleted manga', async () => {
		for (const manga of [null, mangaRow({ deletedAt: new Date() })]) {
			const { job, matched } = build(manga);
			await job({ idManga: 7 });
			expect(matched).toEqual([]);
		}
	});
});

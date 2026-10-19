import { describe, expect, test, vi } from 'vitest';
import {
	createMatcher,
	matchConfigFrom,
	selectSuggestions,
} from '../../../../service/coverSuggestions/matching.js';
import FakeCatalogCoverHashes from '../../../fakes/FakeCatalogCoverHashes.js';
import FakeCoverSuggestions from '../../../fakes/FakeCoverSuggestions.js';
import FakeLogger from '../../../fakes/FakeLogger.js';
import { titleSimilarity } from '../../../../service/coverSuggestions/titleSimilarity.js';

const CONFIG = {
	strong: 0.9,
	possible: 0.8,
	genericLimit: 10,
	topN: 3,
	titleEntry: 0.9,
	titlePromote: 0.8,
	titleTopN: 1,
};
// A hash whose lowest `bits` bits differ from 0n: similarity 1 - bits/64.
const bitsOff = (bits) => (bits ? (1n << BigInt(bits)) - 1n : 0n);

const candidate = (overrides) => ({
	idPlugin: 'nexustoons',
	idMangaPlugin: overrides.idMangaPlugin ?? 'x',
	titlePlugin: 'T',
	dSimilarity: 0,
	pSimilarity: 0,
	titleSimilarity: 0,
	conflict: false,
	...overrides,
});

function arrangeMatcher({
	links,
	rows,
	localCover = null,
	connectorIds,
	hashedImages = [],
	catalogs = {},
	linkedItems = [],
	config = CONFIG,
	catalogReads = [],
}) {
	const hashes = new FakeCatalogCoverHashes(rows);
	const suggestions = new FakeCoverSuggestions();
	const logger = new FakeLogger();
	const matcher = createMatcher({
		getConfig: () => config,
		listConnectorIds: () => connectorIds ?? ['mangeek', 'nexustoons'],
		listConnectorsByManga: async () => links,
		hashes,
		suggestions,
		readLocalCover: async () => localCover,
		hashImage: async (image) => {
			hashedImages.push(image);
			return { dHash: 0n, pHash: 0n };
		},
		loadCatalog: async (idPlugin) => {
			catalogReads.push(idPlugin);
			return catalogs[idPlugin] ?? [];
		},
		listLinksByPlugin: async ({ idPlugin }) =>
			linkedItems.filter((item) => item.idPlugin === idPlugin),
		logger,
	});
	return { matcher, hashes, suggestions, logger };
}

const link = (idMangaPlugin) => ({
	idPlugin: 'mangeek',
	idMangaPlugin,
	titlePlugin: 'Solo Leveling',
	isActive: true,
});
const row = (idPlugin, idMangaPlugin, dBits, pBits = dBits) => ({
	idPlugin,
	idMangaPlugin,
	coverUrl: `u-${idMangaPlugin}`,
	dHash: bitsOff(dBits),
	pHash: bitsOff(pBits),
});

describe('cover matching', () => {
	test('uses every linked item as a reference', async () => {
		// Second link's cover is all-ones; the candidate equals it.
		const { matcher, suggestions } = arrangeMatcher({
			links: [link('m1'), link('m2')],
			rows: [
				row('mangeek', 'm1', 0),
				{ ...row('mangeek', 'm2', 64), dHash: bitsOff(64), pHash: bitsOff(64) },
				{
					...row('nexustoons', 'n1', 64),
					dHash: bitsOff(64),
					pHash: bitsOff(64),
				},
			],
		});

		await matcher.matchManga({ idManga: 7, title: 'Solo Leveling' });

		expect(suggestions.pending.get(7)).toEqual([
			expect.objectContaining({
				idMangaPlugin: 'n1',
				band: 'strong',
				score: 1,
			}),
		]);
	});

	test('falls back to the local cover as reference', async () => {
		const localCover = Buffer.from('local');
		const hashedImages = [];
		const { matcher, suggestions, hashes } = arrangeMatcher({
			links: [link('m1')],
			rows: [row('nexustoons', 'n1', 0)],
			localCover,
			hashedImages,
		});

		await matcher.matchManga({ idManga: 7, title: 'Solo Leveling' });

		expect(suggestions.pending.get(7)).toEqual([
			expect.objectContaining({ idMangaPlugin: 'n1', band: 'strong' }),
		]);
		expect(hashes.row('mangeek', 'm1')).toBeNull();
		expect(hashedImages).toEqual([localCover]);
	});

	test('a manga without reference and without title match gets no suggestion', async () => {
		const { matcher, suggestions } = arrangeMatcher({
			links: [link('m1')],
			rows: [row('nexustoons', 'n1', 0)],
		});

		await expect(
			matcher.matchManga({ idManga: 7, title: 'Solo Leveling' }),
		).resolves.toEqual([]);
		expect(suggestions.pending.get(7) ?? []).toEqual([]);
	});

	test('one failing manga does not abort the others', async () => {
		const { matcher, suggestions, logger } = arrangeMatcher({
			links: [link('m1')],
			rows: [row('mangeek', 'm1', 0), row('nexustoons', 'n1', 0)],
		});
		suggestions.mangasMissingConnectors = [
			{ idManga: 1, title: 'Broken' },
			{ idManga: 2, title: 'Fine' },
		];
		const realMatch = suggestions.replacePending;
		suggestions.replacePending = vi.fn(async (args) => {
			if (args.idManga === 1) throw new Error('db down');
			return realMatch(args);
		});

		await matcher.matchAll();

		expect(logger.errors).toEqual([
			{
				message: { status: 'matching_falhou', idManga: 1, error: 'db down' },
				meta: undefined,
			},
		]);
		expect(suggestions.pending.get(2)).toHaveLength(1);
	});

	test('assigns the band from the best of the two similarities', async () => {
		const table = [
			[CONFIG, 0.95, 0.7, 'strong'],
			[CONFIG, 0.7, 0.9, 'strong'],
			[CONFIG, 0.89, 0.85, 'possible'],
			[CONFIG, 0.8, 0.1, 'possible'],
			[CONFIG, 0.79, 0.79, null],
		];
		vi.resetModules();
		vi.stubEnv('COVER_MATCH_STRONG', '0.95');
		vi.stubEnv('COVER_MATCH_POSSIBLE', '0.85');
		const { default: env } = await import('../../../../infra/env.js');
		const fromEnv = { ...CONFIG, ...matchConfigFrom(env) };
		vi.unstubAllEnvs();
		table.push([fromEnv, 0.92, 0, 'possible'], [fromEnv, 0.84, 0, null]);

		for (const [config, d, p, band] of table) {
			const [selected] = selectSuggestions(
				[candidate({ dSimilarity: d, pSimilarity: p })],
				config,
			);
			expect(selected?.band ?? null, `${d}/${p} strong=${config.strong}`).toBe(
				band,
			);
			if (selected) expect(selected.score).toBe(Math.max(d, p));
		}
	});

	test('keeps only strong matches for a generic cover', () => {
		const many = (count, strongCount) =>
			Array.from({ length: count }, (_, i) =>
				candidate({
					idMangaPlugin: `c${i}`,
					dSimilarity: i < strongCount ? 0.95 - i * 0.01 : 0.85,
				}),
			);

		const generic = selectSuggestions(many(11, 2), CONFIG);
		const notGeneric = selectSuggestions(many(10, 2), CONFIG);

		expect(generic.map((s) => s.band)).toEqual(['strong', 'strong']);
		expect(notGeneric.map((s) => s.band)).toEqual([
			'strong',
			'strong',
			'possible',
		]);
	});

	test('reads the generic limit and top N from the env', async () => {
		vi.resetModules();
		vi.stubEnv('COVER_MATCH_GENERIC_LIMIT', '4');
		vi.stubEnv('COVER_MATCH_TOP_N', '1');
		const { default: env } = await import('../../../../infra/env.js');
		const config = matchConfigFrom(env);
		vi.unstubAllEnvs();
		const five = Array.from({ length: 5 }, (_, i) =>
			candidate({ idMangaPlugin: `c${i}`, dSimilarity: i === 0 ? 0.95 : 0.85 }),
		);

		expect(config).toMatchObject({ genericLimit: 4, topN: 1 });
		// 5 matches over a limit of 4: generic, only the strong one stays.
		expect(
			selectSuggestions(five, { ...config, topN: 3 }).map((s) => s.band),
		).toEqual(['strong']);
		// 4 matches, not generic: top N of 1 keeps the best.
		expect(
			selectSuggestions(five.slice(0, 4), config).map((s) => s.idMangaPlugin),
		).toEqual(['c0']);
	});

	test('keeps the top N ordered by score then title similarity', () => {
		const scored = [
			[0.95, 0.1],
			[0.92, 0.2],
			[0.92, 0.7],
			[0.85, 0.9],
			[0.81, 0.9],
		].map(([score, title], i) =>
			candidate({
				idMangaPlugin: `c${i}`,
				dSimilarity: score,
				titleSimilarity: title,
			}),
		);

		const top3 = selectSuggestions(scored, CONFIG);
		const top1 = selectSuggestions(scored, { ...CONFIG, topN: 1 });

		expect(top3.map((s) => [s.score, s.titleSimilarity])).toEqual([
			[0.95, 0.1],
			[0.92, 0.7],
			[0.92, 0.2],
		]);
		expect(top1.map((s) => s.idMangaPlugin)).toEqual(['c0']);
	});

	test('title similarity never filters a cover match', () => {
		const selected = selectSuggestions(
			[
				candidate({
					idMangaPlugin: 'low',
					dSimilarity: 0.79,
					titleSimilarity: 1,
				}),
				candidate({
					idMangaPlugin: 'mid',
					dSimilarity: 0.85,
					titleSimilarity: 1,
				}),
			],
			CONFIG,
		);

		expect(selected.map((s) => [s.idMangaPlugin, s.band])).toEqual([
			['mid', 'strong'],
		]);
	});

	test('conflicts sit outside the top N and the generic count', () => {
		const free = (count, score) =>
			Array.from({ length: count }, (_, i) =>
				candidate({ idMangaPlugin: `f${i}`, dSimilarity: score }),
			);
		const conflicts = Array.from({ length: 4 }, (_, i) =>
			candidate({ idMangaPlugin: `k${i}`, dSimilarity: 0.85, conflict: true }),
		);

		const withThree = selectSuggestions(
			[...free(3, 0.95), ...conflicts],
			CONFIG,
		);
		const withNine = selectSuggestions(
			[...free(9, 0.85), ...conflicts],
			CONFIG,
		);

		expect(withThree.filter((s) => !s.conflict)).toHaveLength(3);
		expect(withThree.filter((s) => s.conflict)).toHaveLength(4);
		expect(withNine.filter((s) => !s.conflict).map((s) => s.band)).toEqual([
			'possible',
			'possible',
			'possible',
		]);
		expect(withNine.filter((s) => s.conflict)).toHaveLength(4);
	});
});

describe('title matching', () => {
	const solo = {
		id: 'solo',
		title: 'Solo Leveling',
		altTitles: ['Upando Sozinho'],
	};
	const reference = {
		idManga: 7,
		title: 'Na Honjaman',
		altTitles: ['Upando Sozinho'],
	};

	test('title similarity uses candidate and reference alternative titles', async () => {
		// Neither main title nor the link title matches: only the shared
		// alternative "Upando Sozinho" can give 1.
		const { matcher, suggestions } = arrangeMatcher({
			links: [{ ...link('m1'), titlePlugin: 'Na Honjaman MG' }],
			rows: [row('mangeek', 'm1', 0), row('nexustoons', 'solo', 0)],
			catalogs: { nexustoons: [solo] },
		});

		await matcher.matchManga(reference);

		expect(suggestions.pending.get(7)).toEqual([
			expect.objectContaining({
				idMangaPlugin: 'solo',
				titlePlugin: 'Solo Leveling',
				titleSimilarity: 1,
			}),
		]);
	});

	test('title promotes a possible cover match', () => {
		const at = (titleSimilarity, dSimilarity = 0.85) =>
			selectSuggestions(
				[candidate({ dSimilarity, titleSimilarity })],
				CONFIG,
			)[0];

		expect(at(0.8)).toMatchObject({ band: 'strong', origin: 'both' });
		expect(at(0.79)).toMatchObject({ band: 'possible', origin: 'cover' });
		expect(at(1, 0.95)).toMatchObject({ band: 'strong', origin: 'cover' });
	});

	test('strong title opens a title-only suggestion', async () => {
		const pair = ['Upando Sozinho Rank', 'Upando Sozinho'];
		const exact = titleSimilarity(...pair);
		const run = async ({ entry, linkedItems = [] }) => {
			const { matcher, suggestions } = arrangeMatcher({
				links: [],
				rows: [],
				connectorIds: ['nexustoons'],
				catalogs: { nexustoons: [{ id: 'up', title: pair[0] }] },
				linkedItems,
				config: { ...CONFIG, titleEntry: entry },
			});
			await matcher.matchManga({ idManga: 7, title: pair[1], altTitles: [] });
			return suggestions.pending.get(7);
		};

		expect(await run({ entry: exact })).toEqual([
			{
				idPlugin: 'nexustoons',
				idMangaPlugin: 'up',
				titlePlugin: pair[0],
				dSimilarity: null,
				pSimilarity: null,
				titleSimilarity: exact,
				score: null,
				band: 'possible',
				origin: 'title',
				conflict: false,
			},
		]);
		expect(await run({ entry: exact + 0.01 })).toEqual([]);
		expect(
			await run({
				entry: exact,
				linkedItems: [
					{ idPlugin: 'nexustoons', idMangaPlugin: 'up', idManga: 9 },
				],
			}),
		).toEqual([]);
	});

	test('short titles never open a title-only suggestion', async () => {
		const run = async (title) => {
			const { matcher, suggestions } = arrangeMatcher({
				links: [],
				rows: [],
				connectorIds: ['nexustoons'],
				catalogs: { nexustoons: [{ id: 'x', title }] },
			});
			await matcher.matchManga({ idManga: 7, title, altTitles: [] });
			return suggestions.pending.get(7).length;
		};

		expect(await run('Reborn')).toBe(0);
		expect(await run('Ab Cd')).toBe(0);
		expect(await run('Upando Sozinho')).toBe(1);
	});

	test('title-only suggestions are capped per connector', async () => {
		const { matcher, suggestions } = arrangeMatcher({
			links: [],
			rows: [row('nexustoons', 'cover', 0)],
			localCover: Buffer.from('local'),
			connectorIds: ['nexustoons'],
			catalogs: {
				nexustoons: [
					{ id: 'a', title: 'Upando Sozinho' },
					{ id: 'b', title: 'Upando Sozinho!' },
					{ id: 'c', title: 'Upando Sozinho Rank' },
					{ id: 'cover', title: 'Outra Obra' },
				],
			},
			config: { ...CONFIG, titleEntry: 0.5 },
		});

		await matcher.matchManga({
			idManga: 7,
			title: 'Upando Sozinho',
			altTitles: [],
		});

		const pending = suggestions.pending.get(7);
		expect(
			pending.filter((s) => s.origin === 'title').map((s) => s.idMangaPlugin),
		).toEqual(['a']);
		expect(
			pending.filter((s) => s.origin !== 'title').map((s) => s.idMangaPlugin),
		).toEqual(['cover']);
	});

	test('manga without cover still gets title suggestions', async () => {
		const { matcher, suggestions } = arrangeMatcher({
			links: [],
			rows: [],
			connectorIds: ['nexustoons'],
			catalogs: { nexustoons: [solo] },
		});

		await matcher.matchManga(reference);

		expect(suggestions.pending.get(7)).toEqual([
			expect.objectContaining({ idMangaPlugin: 'solo', origin: 'title' }),
		]);
	});

	test('matchAll builds each catalog title index once', async () => {
		const catalogReads = [];
		const { matcher, suggestions } = arrangeMatcher({
			links: [],
			rows: [],
			catalogReads,
			catalogs: { nexustoons: [solo], mangeek: [] },
		});
		suggestions.mangasMissingConnectors = [
			{ idManga: 1, title: 'A', altTitles: [] },
			{ idManga: 2, title: 'B', altTitles: [] },
			{ idManga: 3, title: 'Upando Sozinho', altTitles: [] },
		];

		await matcher.matchAll();

		expect(catalogReads.toSorted()).toEqual(['mangeek', 'nexustoons']);
		expect(suggestions.pending.get(3)).toHaveLength(1);
	});
});

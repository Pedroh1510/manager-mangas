import { describe, expect, test } from 'vitest';
import {
	blockKey,
	buildHeldLog,
	findGap,
	planDiscovery,
} from '../../../service/chapterGap.js';
import FakeDiscoveryLinks from '../../fakes/FakeDiscoveryLinks.js';

const keys = (...v) => new Set(v.map(String));

describe('findGap', () => {
	test('holds 177 when highest known integer below is 171', () => {
		expect(findGap({ volume: '177', knownVolumeKeys: keys(170, 171) })).toEqual(
			{ isHeld: true, previousKnownVolume: 171 },
		);
	});

	test('does not hold the next contiguous volume', () => {
		expect(findGap({ volume: 172, knownVolumeKeys: keys(171) }).isHeld).toBe(
			false,
		);
	});

	test('does not hold when nothing is known below', () => {
		expect(findGap({ volume: 5, knownVolumeKeys: keys() })).toEqual({
			isHeld: false,
			previousKnownVolume: null,
		});
		expect(findGap({ volume: 1, knownVolumeKeys: keys(10) }).isHeld).toBe(
			false,
		);
	});

	test('decimal volumes are never held and never fill a gap', () => {
		expect(
			findGap({ volume: '171.5', knownVolumeKeys: keys(100) }).isHeld,
		).toBe(false);
		expect(
			findGap({ volume: 173, knownVolumeKeys: keys(171, '172.5') }),
		).toEqual({ isHeld: true, previousKnownVolume: 171 });
	});
});

describe('planDiscovery', () => {
	const ch = (volume) => ({
		id: `c${volume}`,
		title: `Ch ${volume}`,
		volume: `${volume}`,
	});
	const range = (from, to) =>
		Array.from({ length: to - from + 1 }, (_, i) => ch(from + i));
	const run = (fake, stored, blocked = []) =>
		planDiscovery({
			links: fake.links(),
			storedVolumeKeys: keys(...stored),
			blockedKeys: new Set(blocked),
			...fake.callbacks(),
		});

	test('holds 177 when no link lists 172-176', async () => {
		const fake = new FakeDiscoveryLinks();
		fake.addLink(1, [ch(170), ch(171), ch(177)]);
		await run(fake, [170, 171]);
		expect(fake.recordedVolumes()).toEqual([]);
		expect(fake.held()).toEqual([{ volume: '177', previousKnownVolume: 171 }]);
	});

	test('records 177 when another link lists 172-176 in the same scan', async () => {
		const fake = new FakeDiscoveryLinks();
		fake.addLink(1, [ch(177)]);
		fake.addLink(2, range(172, 176));
		await run(fake, [170, 171]);
		expect(fake.recordedVolumes().sort()).toEqual([
			'172',
			'173',
			'174',
			'175',
			'176',
			'177',
		]);
		expect(fake.held()).toEqual([]);
	});

	test('records 177 once when the gap closes and another link also lists 177', async () => {
		const fake = new FakeDiscoveryLinks();
		fake.addLink(1, range(172, 177));
		fake.addLink(2, [ch(177)]);
		await run(fake, [171]);
		const volumes = fake.recordedVolumes();
		expect(volumes.filter((v) => v === '177')).toHaveLength(1);
		expect(volumes).toHaveLength(6);
		expect(fake.held()).toEqual([]);
	});

	test('blocked chapter is skipped and does not fill a gap', async () => {
		const fake = new FakeDiscoveryLinks();
		fake.addLink(1, [ch(177)]);
		fake.addLink(2, range(172, 176));
		const blocked = range(172, 176).map((c) =>
			blockKey({ idMangaConnector: 2 }, c),
		);
		await run(fake, [171], blocked);
		expect(fake.recordedVolumes()).toEqual([]);
		expect(fake.held().map((h) => h.volume)).toEqual(['177']);
	});

	test('rejected link contributes no volumes and others still finish', async () => {
		const fake = new FakeDiscoveryLinks();
		fake.addLink(1, [ch(177)]);
		fake.addLink(2, range(172, 176), { error: new Error('boom') });
		const { outcomes } = await run(fake, [171]);
		expect(outcomes.filter((o) => o.status === 'rejected')).toHaveLength(1);
		expect(fake.held().map((h) => h.volume)).toEqual(['177']);
	});

	test('contiguous volume is recorded before a slow link answers', async () => {
		const fake = new FakeDiscoveryLinks();
		let release;
		const gate = new Promise((resolve) => {
			release = resolve;
		});
		fake.addLink(1, [ch(172)]);
		fake.addLink(2, [], { gate });
		const pending = run(fake, [171]);
		await new Promise((resolve) => setImmediate(resolve));
		expect(fake.recordedVolumes()).toEqual(['172']);
		release();
		await pending;
	});

	test('empty database holds nothing', async () => {
		const fake = new FakeDiscoveryLinks();
		fake.addLink(1, [ch(50), ch(51), ch(90)]);
		await run(fake, []);
		expect(fake.recordedVolumes()).toEqual(['50', '51', '90']);
		expect(fake.held()).toEqual([]);
	});

	test('releases a held volume once when two links list it', async () => {
		const fake = new FakeDiscoveryLinks();
		fake.addLink(1, [ch(170), ch(171), ch(177)]);
		fake.addLink(2, [ch(177)]);
		const { recorded } = await run(fake, [170, 171]);
		expect(recorded.map((c) => c.volume)).toEqual(['177']);
		expect(fake.held()).toEqual([]);
	});

	test('corroborated 177 with only 177 listed by both links is recorded once', async () => {
		const fake = new FakeDiscoveryLinks();
		fake.addLink(1, [ch(177)]);
		fake.addLink(2, [ch(177)]);
		await run(fake, [171]);
		expect(fake.recordedVolumes()).toEqual(['177']);
		expect(fake.held()).toEqual([]);
	});

	test('a blocked listing does not corroborate a held volume', async () => {
		const fake = new FakeDiscoveryLinks();
		fake.addLink(1, [ch(177)]);
		fake.addLink(2, [ch(177)]);
		await run(fake, [171], [blockKey({ idMangaConnector: 2 }, ch(177))]);
		expect(fake.recordedVolumes()).toEqual([]);
		expect(fake.held()).toEqual([{ volume: '177', previousKnownVolume: 171 }]);
	});

	test('reports a held volume once when the same link lists it twice', async () => {
		const fake = new FakeDiscoveryLinks();
		fake.addLink(1, [ch(177), { ...ch(177), id: 'c177-bis' }]);
		await run(fake, [171]);
		expect(fake.held()).toEqual([{ volume: '177', previousKnownVolume: 171 }]);
	});

	test('other id of the same volume and link is recorded when one is blocked', async () => {
		const fake = new FakeDiscoveryLinks();
		const blockedOne = ch(172);
		const sibling = { ...ch(172), id: 'c172-real' };
		fake.addLink(1, [blockedOne, sibling]);
		await run(fake, [171], [blockKey({ idMangaConnector: 1 }, blockedOne)]);
		expect(fake.recorded.map((entry) => entry.chapter.id)).toEqual([
			'c172-real',
		]);
	});

	test('unblocked chapter is recorded on the next run', async () => {
		const blockedRun = new FakeDiscoveryLinks();
		blockedRun.addLink(1, [ch(172)]);
		await run(blockedRun, [171], [blockKey({ idMangaConnector: 1 }, ch(172))]);
		expect(blockedRun.recordedVolumes()).toEqual([]);
		const nextRun = new FakeDiscoveryLinks();
		nextRun.addLink(1, [ch(172)]);
		await run(nextRun, [171], []);
		expect(nextRun.recordedVolumes()).toEqual(['172']);
	});

	test('pass-2 record failure keeps other chapters and surfaces in outcomes', async () => {
		const fake = new FakeDiscoveryLinks();
		fake.addLink(1, [ch(173)]);
		fake.addLink(2, [ch(172), ch(174)]);
		const callbacks = fake.callbacks();
		const recordChapter = async (args) => {
			if (args.chapter.volume === '174') throw new Error('insert failed');
			return callbacks.recordChapter(args);
		};
		const { recorded, outcomes } = await planDiscovery({
			links: fake.links(),
			storedVolumeKeys: keys(171),
			blockedKeys: new Set(),
			...callbacks,
			recordChapter,
		});
		expect(recorded.map((c) => c.volume).sort()).toEqual(['172', '173']);
		expect(outcomes.filter((o) => o.status === 'rejected')).toHaveLength(1);
	});
});

describe('buildHeldLog', () => {
	test('builds the chapter_held_gap warn payload', () => {
		const entry = buildHeldLog({
			idManga: 15,
			link: { idPlugin: 'mangeek', idMangaConnector: 4 },
			chapter: { id: '1700083334', title: 'Capítulo 177', volume: '177' },
			previousKnownVolume: 171,
		});
		expect(entry).toEqual({
			status: 'chapter_held_gap',
			idManga: 15,
			idPlugin: 'mangeek',
			idMangaConnector: 4,
			idChapterPlugin: '1700083334',
			volume: '177',
			previousKnownVolume: 171,
		});
	});
});

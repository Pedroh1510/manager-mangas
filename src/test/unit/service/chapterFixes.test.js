import { describe, expect, test } from 'vitest';
import {
	BadRequestError,
	ConflictError,
	NotFoundError,
} from '../../../infra/errors.js';
import { createChapterFixes } from '../../../service/chapterFixes.js';
import FakeChapterFixesDeps from '../../fakes/FakeChapterFixesDeps.js';

const chapter = {
	idChapter: 1248700,
	idManga: 15,
	idMangaConnector: 15,
	idChapterPlugin: '1700083334',
	volume: '177.0000',
	title: 'Sobrevivendo...',
};

function build(options) {
	const deps = new FakeChapterFixesDeps(options);
	return { deps, fixes: createChapterFixes(deps.asDeps()) };
}

describe('ChapterFixes', () => {
	test('blockChapter inserts block, deletes chapter, scans Kavita', async () => {
		const { deps, fixes } = build({ chapter });
		const result = await fixes.blockChapter({
			idManga: 15,
			idChapter: 1248700,
			reason: 'cópia do 171',
		});
		expect(result).toEqual({ idBlockedChapter: 7 });
		expect(deps.inserted).toEqual([
			{
				idMangaConnector: 15,
				idChapterPlugin: '1700083334',
				volume: '177.0000',
				reason: 'cópia do 171',
			},
		]);
		expect(deps.deleted).toEqual([{ idManga: 15, idChapter: 1248700 }]);
		expect(deps.scanned).toEqual([{ title: 'Sobrevivendo...' }]);
	});

	test('blockChapter of another manga throws NotFoundError and changes nothing', async () => {
		const { deps, fixes } = build({ chapter });
		await expect(
			fixes.blockChapter({ idManga: 99, idChapter: 1248700, reason: null }),
		).rejects.toBeInstanceOf(NotFoundError);
		expect(deps.inserted).toEqual([]);
		expect(deps.deleted).toEqual([]);
	});

	test('blockChapter of missing chapter throws NotFoundError', async () => {
		const { fixes } = build({ chapter: null });
		await expect(
			fixes.blockChapter({ idManga: 15, idChapter: 1, reason: null }),
		).rejects.toThrow(/1.*15/);
	});

	test('blockChapter still resolves when Kavita scan returns false', async () => {
		const { fixes } = build({ chapter, scanResult: false });
		await expect(
			fixes.blockChapter({ idManga: 15, idChapter: 1248700, reason: null }),
		).resolves.toEqual({ idBlockedChapter: 7 });
	});

	test('unblock unknown id throws NotFoundError', async () => {
		const { deps, fixes } = build({ chapter });
		deps.unblockedCount = 0;
		await expect(
			fixes.unblock({ idManga: 15, idBlockedChapter: 5 }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	test('unblock existing id resolves and listBlocked returns rows', async () => {
		const { fixes } = build({ chapter });
		await expect(
			fixes.unblock({ idManga: 15, idBlockedChapter: 5 }),
		).resolves.toBeUndefined();
		await expect(fixes.listBlocked({ idManga: 15 })).resolves.toEqual([]);
	});

	test('blockChapter propagates deleteChapter failure and skips the scan', async () => {
		const { deps, fixes } = build({ chapter });
		deps.deleteError = new Error('disk boom');
		await expect(
			fixes.blockChapter({ idManga: 15, idChapter: 1248700, reason: null }),
		).rejects.toThrow('disk boom');
		expect(deps.scanned).toEqual([]);
	});

	test('blockChapter retried after deleteChapter failed completes with the same block id', async () => {
		const { deps, fixes } = build({ chapter });
		const params = { idManga: 15, idChapter: 1248700, reason: 'x' };
		deps.deleteError = new Error('disk boom');
		await expect(fixes.blockChapter(params)).rejects.toThrow('disk boom');
		deps.deleteError = null;
		await expect(fixes.blockChapter(params)).resolves.toEqual({
			idBlockedChapter: 7,
		});
		expect(deps.deleted).toEqual([{ idManga: 15, idChapter: 1248700 }]);
	});

	test('exposes only the public actions', () => {
		const { fixes } = build({ chapter });
		expect(Object.keys(fixes).sort()).toEqual([
			'blockChapter',
			'listBlocked',
			'listSources',
			'replaceSource',
			'unblock',
		]);
	});
});

const sourceChapter = { ...chapter, title: 'T' };
const link = (idMangaConnector, idPlugin, isActive = true) => ({
	idMangaConnector,
	idPlugin,
	idMangaPlugin: `m-${idPlugin}`,
	titlePlugin: `T ${idPlugin}`,
	isActive,
});
const replaceParams = {
	idManga: 15,
	idChapter: 1248700,
	idMangaConnector: 31,
	idChapterPlugin: '435999',
};

function buildReplace() {
	const built = build({ chapter: sourceChapter });
	built.deps.links = [link(15, 'mangeek'), link(31, 'nexustoons')];
	built.deps.sourceChapters = {
		nexustoons: [{ id: '435999', title: 'Capítulo 177', volume: '177' }],
	};
	return built;
}

describe('ChapterFixes.listSources', () => {
	test('listSources marks current link, available, missing, blocked, disabled, failed', async () => {
		const { deps, fixes } = build({ chapter: sourceChapter });
		deps.links = [
			link(15, 'mangeek'),
			link(21, 'blitz'),
			link(22, 'empty'),
			link(23, 'wicomix'),
			link(24, 'broken'),
			link(25, 'inactive', false),
		];
		deps.sourceChapters = {
			mangeek: [{ id: '1700083334', title: 'Cap 177', volume: '177.0000' }],
			blitz: [{ id: 'b-177', title: 'Cap. 177', volume: 177 }],
			empty: [{ id: 'e-176', title: 'Cap. 176', volume: '176' }],
			broken: new Error('site down'),
		};
		deps.blockedKeys = new Set(['15:1700083334']);
		deps.disabled = { wicomix: 'paywall' };

		const sources = await fixes.listSources({
			idManga: 15,
			idChapter: 1248700,
		});

		const base = (l) => ({
			idMangaConnector: l.idMangaConnector,
			idPlugin: l.idPlugin,
			titlePlugin: l.titlePlugin,
			isCurrent: l.idMangaConnector === 15,
		});
		expect(sources).toEqual([
			{
				...base(deps.links[0]),
				status: 'blocked',
				idChapterPlugin: '1700083334',
				title: 'Cap 177',
			},
			{
				...base(deps.links[1]),
				status: 'available',
				idChapterPlugin: 'b-177',
				title: 'Cap. 177',
			},
			{ ...base(deps.links[2]), status: 'missing' },
			{ ...base(deps.links[3]), status: 'disabled', reason: 'paywall' },
			{ ...base(deps.links[4]), status: 'failed', reason: 'site down' },
		]);
	});

	test('listSources of another manga throws NotFoundError', async () => {
		const { fixes } = build({ chapter: sourceChapter });
		await expect(
			fixes.listSources({ idManga: 99, idChapter: 1248700 }),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});

describe('ChapterFixes.replaceSource', () => {
	test('replaceSource swaps file and row after a good download', async () => {
		const { deps, fixes } = buildReplace();

		await expect(fixes.replaceSource(replaceParams)).resolves.toEqual({
			idChapter: 1248700,
		});

		expect(deps.downloads).toEqual([
			{
				manga: 'T',
				chapter: '177.0000',
				pages: deps.pages,
				cookie: 'c=1',
				userAgent: 'UA',
				targetPath: '/d/T/177.0000.cbz.replacing',
			},
		]);
		expect(deps.fs.renamed).toEqual([
			{ from: '/d/T/177.0000.cbz.replacing', to: '/d/T/177.0000.cbz' },
		]);
		expect(deps.updated).toEqual([
			{
				idChapter: 1248700,
				idMangaConnector: 31,
				idChapterPlugin: '435999',
				name: 'Capítulo 177',
			},
		]);
		expect(deps.scanned).toEqual([{ title: 'T' }]);
	});

	test('replaceSource keeps old file and row when download fails', async () => {
		const { deps, fixes } = buildReplace();
		deps.downloadError = new Error('placeholder');

		await expect(fixes.replaceSource(replaceParams)).rejects.toThrow(
			'placeholder',
		);

		expect(deps.fs.renamed).toEqual([]);
		expect(deps.updated).toEqual([]);
		expect(deps.fs.removed).toEqual(['/d/T/177.0000.cbz.replacing']);
		expect(deps.scanned).toEqual([]);
	});

	test('replaceSource returns 409 when chapter id already stored in another row', async () => {
		const { deps, fixes } = buildReplace();
		deps.updateError = Object.assign(new Error('duplicate key'), {
			code: '23505',
		});

		const error = await fixes.replaceSource(replaceParams).catch((e) => e);

		expect(error).toBeInstanceOf(ConflictError);
		expect(error.message).toMatch(/435999/);
		expect(deps.fs.renamed).toEqual([]);
		expect(deps.fs.removed).toEqual(['/d/T/177.0000.cbz.replacing']);
	});

	test('replaceSource propagates non-unique update errors untouched', async () => {
		const { deps, fixes } = buildReplace();
		deps.updateError = new Error('db gone');
		await expect(fixes.replaceSource(replaceParams)).rejects.toThrow('db gone');
		expect(deps.fs.renamed).toEqual([]);
	});

	test('replaceSource rejects a target listed with a different volume', async () => {
		const { deps, fixes } = buildReplace();
		deps.sourceChapters.nexustoons = [
			{ id: '435999', title: 'Cap 178', volume: '178' },
		];

		const error = await fixes.replaceSource(replaceParams).catch((e) => e);

		expect(error).toBeInstanceOf(BadRequestError);
		expect(error.message).toMatch(/177.*178|178.*177/);
		expect(deps.downloads).toEqual([]);
	});

	test('replaceSource rejects a target the link does not list', async () => {
		const { deps, fixes } = buildReplace();
		deps.sourceChapters.nexustoons = [];
		await expect(fixes.replaceSource(replaceParams)).rejects.toBeInstanceOf(
			BadRequestError,
		);
	});

	test('replaceSource rejects a link of another manga or inactive', async () => {
		const { deps, fixes } = buildReplace();
		await expect(
			fixes.replaceSource({ ...replaceParams, idMangaConnector: 999 }),
		).rejects.toBeInstanceOf(BadRequestError);
		deps.links = [link(31, 'nexustoons', false)];
		await expect(fixes.replaceSource(replaceParams)).rejects.toBeInstanceOf(
			BadRequestError,
		);
	});

	test('replaceSource of a chapter of another manga throws NotFoundError', async () => {
		const { fixes } = buildReplace();
		await expect(
			fixes.replaceSource({ ...replaceParams, idManga: 99 }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	test('replaceSource rejects disabled connector and blocked pair with ConflictError', async () => {
		const { deps, fixes } = buildReplace();
		deps.disabled = { nexustoons: null };
		await expect(fixes.replaceSource(replaceParams)).rejects.toBeInstanceOf(
			ConflictError,
		);
		deps.disabled = {};
		deps.blockedKeys = new Set(['31:435999']);
		await expect(fixes.replaceSource(replaceParams)).rejects.toBeInstanceOf(
			ConflictError,
		);
		expect(deps.downloads).toEqual([]);
	});
});

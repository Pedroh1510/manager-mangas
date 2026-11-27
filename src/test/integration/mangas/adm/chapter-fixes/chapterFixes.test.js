import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import api from '../../../../../infra/api.js';
import ChaptersRepository from '../../../../../repository/chapters.js';
import MangaConnectorsRepository from '../../../../../repository/mangaConnectors.js';
import orchestrator from '../../../../orchestrator.js';
import AdmUtils from '../utils.js';

const admUtils = new AdmUtils();
const base = (idManga) => `/mangas/adm/${idManga}`;
const setFixtureEnabled = (enabled) =>
	api.put('/mangas/adm/connector-switches/test-fixture', { enabled });

function settle(request) {
	return request.catch((error) => ({
		status: error.status,
		data: error.response?.data,
	}));
}

async function linkFixtureManga(title, idMangaPlugin) {
	const { data: manga } = await admUtils.createManga({ title });
	await admUtils.linkConnector({
		idManga: manga.idManga,
		idPlugin: 'test-fixture',
		idMangaPlugin,
		titlePlugin: title,
	});
	const [link] = await MangaConnectorsRepository.listConnectorsByManga({
		idManga: manga.idManga,
	});
	return { idManga: manga.idManga, idMangaConnector: link.idMangaConnector };
}

async function insertChapter({ idManga, idMangaConnector }, idChapterPlugin) {
	const volume = Number(idChapterPlugin.replace('ch-', ''));
	const row = await ChaptersRepository.insertChapter({
		idManga,
		idMangaConnector,
		idChapterPlugin,
		name: `Capítulo ${volume}`,
		volume,
	});
	return row.idChapter;
}

async function blockChapter({ idManga, idChapter, body }) {
	return api.post(`${base(idManga)}/chapters/${idChapter}/block`, body ?? {});
}

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
});

describe('chapter fix routes', () => {
	test('POST block then GET blocked-chapters lists it and chapter row is gone', async () => {
		const manga = await linkFixtureManga('Block Manga', '4');
		const idChapter = await insertChapter(manga, 'ch-376');

		const blocked = await blockChapter({
			...manga,
			idChapter,
			body: { reason: 'cópia' },
		});
		const list = await api.get(`${base(manga.idManga)}/blocked-chapters`);
		const chapters = await api.get(`${base(manga.idManga)}/chapters`);

		expect(blocked.status).toBe(201);
		expect(blocked.data).toEqual({ idBlockedChapter: expect.any(Number) });
		expect(list.data).toHaveLength(1);
		expect(list.data[0]).toMatchObject({
			idBlockedChapter: blocked.data.idBlockedChapter,
			idChapterPlugin: 'ch-376',
			reason: 'cópia',
		});
		expect(chapters.data).toEqual([]);
	});

	test('POST block with empty reason stores null', async () => {
		const manga = await linkFixtureManga('Empty Reason', '5');
		const idChapter = await insertChapter(manga, 'ch-375');

		await blockChapter({ ...manga, idChapter, body: { reason: '' } });
		const list = await api.get(`${base(manga.idManga)}/blocked-chapters`);

		expect(list.data[0].reason).toBeNull();
	});

	test('POST block with reason over 200 chars returns 400', async () => {
		const manga = await linkFixtureManga('Long Reason', '1');
		const idChapter = await insertChapter(manga, 'ch-376');

		const response = await settle(
			blockChapter({ ...manga, idChapter, body: { reason: 'x'.repeat(201) } }),
		);

		expect(response.status).toBe(400);
	});

	test('POST block again after the row is re-inserted keeps the same idBlockedChapter', async () => {
		const manga = await linkFixtureManga('Idempotent Block', '6');
		const first = await insertChapter(manga, 'ch-376');
		const one = await blockChapter({ ...manga, idChapter: first });
		const second = await insertChapter(manga, 'ch-376');

		const two = await blockChapter({ ...manga, idChapter: second });

		expect(two.status).toBe(201);
		expect(two.data.idBlockedChapter).toBe(one.data.idBlockedChapter);
	});

	test('DELETE blocked-chapters removes it; unknown id returns 404', async () => {
		const manga = await linkFixtureManga('Unblock Manga', '7');
		const idChapter = await insertChapter(manga, 'ch-376');
		const { data } = await blockChapter({ ...manga, idChapter });

		const removed = await api.delete(
			`${base(manga.idManga)}/blocked-chapters/${data.idBlockedChapter}`,
		);
		const missing = await settle(
			api.delete(`${base(manga.idManga)}/blocked-chapters/999999`),
		);
		const list = await api.get(`${base(manga.idManga)}/blocked-chapters`);

		expect(removed.status).toBe(200);
		expect(missing.status).toBe(404);
		expect(list.data).toEqual([]);
	});

	test('DELETE blocked-chapters of another manga returns 404 and keeps the block', async () => {
		const mangaA = await linkFixtureManga('Scope A', '8');
		const mangaB = await linkFixtureManga('Scope B', '9');
		const idChapter = await insertChapter(mangaA, 'ch-376');
		const { data } = await blockChapter({ ...mangaA, idChapter });

		const response = await settle(
			api.delete(
				`${base(mangaB.idManga)}/blocked-chapters/${data.idBlockedChapter}`,
			),
		);
		const list = await api.get(`${base(mangaA.idManga)}/blocked-chapters`);

		expect(response.status).toBe(404);
		expect(list.data).toHaveLength(1);
	});

	test('GET sources lists test-fixture as current link', async () => {
		const manga = await linkFixtureManga('Sources Manga', '10');
		const idChapter = await insertChapter(manga, 'ch-376');

		const response = await api.get(
			`${base(manga.idManga)}/chapters/${idChapter}/sources`,
		);

		expect(response.status).toBe(200);
		expect(response.data).toHaveLength(1);
		expect(response.data[0]).toMatchObject({
			idPlugin: 'test-fixture',
			isCurrent: true,
		});
	});

	test('POST replace with link of another manga returns 400', async () => {
		const manga = await linkFixtureManga('Replace Own', '11');
		const other = await linkFixtureManga('Replace Other', '12');
		const idChapter = await insertChapter(manga, 'ch-376');

		const response = await settle(
			api.post(`${base(manga.idManga)}/chapters/${idChapter}/replace`, {
				idMangaConnector: other.idMangaConnector,
				idChapterPlugin: 'ch-376',
			}),
		);

		expect(response.status).toBe(400);
	});

	test('POST replace keeps chapter when fixture download fails', async () => {
		const manga = await linkFixtureManga('Replace Fail', '13');
		const idChapter = await insertChapter(manga, 'ch-376');

		const response = await settle(
			api.post(`${base(manga.idManga)}/chapters/${idChapter}/replace`, {
				idMangaConnector: manga.idMangaConnector,
				idChapterPlugin: 'ch-376',
			}),
		);
		const chapters = await api.get(`${base(manga.idManga)}/chapters`);

		expect(response.status).toBeGreaterThanOrEqual(400);
		expect(chapters.data.map((chapter) => chapter.idChapter)).toEqual([
			idChapter,
		]);
	});

	describe('with connector disabled', () => {
		afterAll(() => setFixtureEnabled(true));

		test('POST replace on disabled connector returns 409', async () => {
			const manga = await linkFixtureManga('Replace Disabled', '14');
			const idChapter = await insertChapter(manga, 'ch-376');
			await setFixtureEnabled(false);

			const response = await settle(
				api.post(`${base(manga.idManga)}/chapters/${idChapter}/replace`, {
					idMangaConnector: manga.idMangaConnector,
					idChapterPlugin: 'ch-376',
				}),
			);

			expect(response.status).toBe(409);
		});
	});
});

import { beforeAll, describe, expect, test } from 'vitest';
import api from '../../../../../infra/api.js';
import BlockedChaptersRepository from '../../../../../repository/blockedChapters.js';
import ChaptersRepository from '../../../../../repository/chapters.js';
import MangaConnectorsRepository from '../../../../../repository/mangaConnectors.js';
import orchestrator from '../../../../orchestrator.js';
import AdmUtils from '../utils.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
});

const admUtils = new AdmUtils();

describe('GET /mangas/adm/:idManga/chapters/missing', () => {
	test('returns chapters known to the connector but not yet in the database', async () => {
		const { data: manga } = await admUtils.createManga({
			title: 'Black Clover',
		});
		await admUtils.linkConnector({
			idManga: manga.idManga,
			idPlugin: 'test-fixture',
			idMangaPlugin: '1',
			titlePlugin: 'Black Clover',
		});

		const response = await api.get(
			`/mangas/adm/${manga.idManga}/chapters/missing`,
		);

		expect(response.status).toBe(200);
		expect(response.data).toHaveLength(2);
		expect(response.data.map((chapter) => chapter.volume).sort()).toEqual([
			375, 376,
		]);
	});

	test('ignores inactive connector links', async () => {
		const { data: manga } = await admUtils.createManga({ title: 'One Piece' });
		await admUtils.linkConnector({
			idManga: manga.idManga,
			idPlugin: 'test-fixture',
			idMangaPlugin: '2',
			titlePlugin: 'One Piece',
		});
		await api.patch(`/mangas/adm/${manga.idManga}/connectors/test-fixture`, {
			isActive: false,
		});

		const response = await api.get(
			`/mangas/adm/${manga.idManga}/chapters/missing`,
		);

		expect(response.status).toBe(200);
		expect(response.data).toEqual([]);
	});

	test('does not list volumes already stored', async () => {
		const { idManga, link } = await linkFixtureManga('Stored Manga', '4');
		await ChaptersRepository.insertChapter({
			idManga,
			idMangaConnector: link.idMangaConnector,
			idChapterPlugin: 'ch-375',
			name: 'Capítulo 375',
			volume: 375,
		});

		const response = await api.get(`/mangas/adm/${idManga}/chapters/missing`);

		expect(response.data.map((chapter) => chapter.volume)).toEqual([376]);
	});

	test('does not list blocked chapters', async () => {
		const { idManga, link } = await linkFixtureManga('Blocked Manga', '5');
		await BlockedChaptersRepository.insertBlocked({
			idMangaConnector: link.idMangaConnector,
			idChapterPlugin: 'ch-376',
			volume: 376,
			reason: null,
		});
		await BlockedChaptersRepository.insertBlocked({
			idMangaConnector: link.idMangaConnector,
			idChapterPlugin: 'ch-375',
			volume: 375,
			reason: null,
		});

		const response = await api.get(`/mangas/adm/${idManga}/chapters/missing`);

		expect(response.data).toEqual([]);
	});
});

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
	return { idManga: manga.idManga, link };
}

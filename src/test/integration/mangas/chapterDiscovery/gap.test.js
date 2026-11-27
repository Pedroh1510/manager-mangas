import { beforeAll, describe, expect, test } from 'vitest';
import { registerForTests } from '../../../../connectors/registry.js';
import TestFixtureConnector from '../../../../connectors/testFixture/TestFixtureConnector.js';
import ChaptersRepository from '../../../../repository/chapters.js';
import MangaConnectorsRepository from '../../../../repository/mangaConnectors.js';
import { updateMangaChapters } from '../../../../service/chapterDiscovery.js';
import orchestrator from '../../../orchestrator.js';
import AdmUtils from '../adm/utils.js';

const admUtils = new AdmUtils();

beforeAll(async () => {
	// updateMangaChapters runs in this process, not in the API server.
	registerForTests('test-fixture', TestFixtureConnector);
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
});

async function createLinkedManga() {
	const { data: manga } = await admUtils.createManga({ title: 'Gap Manga' });
	await admUtils.linkConnector({
		idManga: manga.idManga,
		idPlugin: 'test-fixture',
		idMangaPlugin: '3',
		titlePlugin: 'Gap Manga',
	});
	const [link] = await MangaConnectorsRepository.listConnectorsByManga({
		idManga: manga.idManga,
	});
	return { idManga: manga.idManga, link };
}

describe('chapter discovery gap rule', () => {
	test('holds fixture volume 177 when 172-176 are missing everywhere', async () => {
		const { idManga, link } = await createLinkedManga();
		for (const volume of [170, 171]) {
			await ChaptersRepository.insertChapter({
				idManga,
				idMangaConnector: link.idMangaConnector,
				idChapterPlugin: `ch-${volume}`,
				name: `Capítulo ${volume}`,
				volume,
			});
		}

		await updateMangaChapters({ idManga });

		const chapters = await ChaptersRepository.listChaptersByManga({ idManga });
		expect(chapters.map((chapter) => chapter.volume)).toEqual([
			'170.0000',
			'171.0000',
		]);
	});
});

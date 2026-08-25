import { mkdir, writeFile } from 'node:fs/promises';
import retry from 'async-retry';
import { registerForTests } from '../connectors/registry.js';
import TestFixtureConnector from '../connectors/testFixture/TestFixtureConnector.js';
import database from '../infra/database.js';
import CONFIG_ENV from '../infra/env.js';
import Download from '../service/download.js';
import MangaAdminService from '../service/mangaAdmin.js';

const webServiceAddress = CONFIG_ENV.URL;
async function waitForAllServices() {
	await waitForWebServer();
	async function waitForWebServer() {
		async function fetchStatusPage() {
			const response = await fetch(`${webServiceAddress}/status`);
			if (response.status !== 200) {
				throw new Error();
			}
		}
		return retry(fetchStatusPage, {
			retries: 100,
			minTimeout: 100,
			maxTimeout: 1000,
		});
	}
}

async function clearDatabase() {
	await database.query('DROP SCHEMA public cascade; CREATE SCHEMA public;');
}

async function runMigrations() {
	await fetch(`${webServiceAddress}/migrations`, { method: 'POST' });
}

async function seedDatabase() {
	registerForTests('test-fixture', TestFixtureConnector);

	const blackClover = await MangaAdminService.createManga({ title: 'Black Clover' });
	await MangaAdminService.linkConnector({
		idManga: blackClover.idManga,
		idPlugin: 'test-fixture',
		idMangaPlugin: '1',
		titlePlugin: 'Black Clover',
	});
	const algo = await MangaAdminService.createManga({ title: 'algo' });
	await MangaAdminService.linkConnector({
		idManga: algo.idManga,
		idPlugin: 'test-fixture',
		idMangaPlugin: '2',
		titlePlugin: 'algo',
	});

	const connectors = await MangaAdminService.listConnectors({
		idManga: blackClover.idManga,
	});
	const idMangaConnector = connectors[0].idMangaConnector;

	await database.query(
		`INSERT INTO chapters("idChapterPlugin","idMangaConnector","idManga","name","volume") VALUES
('ch-376','${idMangaConnector}',${blackClover.idManga},'Chapter capitulo-376','376'),
('ch-375','${idMangaConnector}',${blackClover.idManga},'Chapter capitulo-375','375'),
('ch-374','${idMangaConnector}',${blackClover.idManga},'Chapter capitulo-374','374');`,
	);

	return { blackClover, algo };
}

async function seedDownload() {
	const { mangaPath, chapterPath } = Download.getPathMangaAndChapter({
		title: 'Black Clover',
		volume: 376,
	});
	console.log(mangaPath, chapterPath);

	await mkdir(mangaPath, { recursive: true }).catch(() => {});
	await writeFile(chapterPath, '', { encoding: 'utf-8' });
}

const orchestrator = {
	waitForAllServices,
	webServiceAddress,
	clearDatabase,
	runMigrations,
	seedDatabase,
	seedDownload,
};

export default orchestrator;

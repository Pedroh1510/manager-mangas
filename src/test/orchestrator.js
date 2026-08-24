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
	await MangaAdminService.registerManga({
		idPlugin: 'test-fixture',
		title: 'Black Clover',
	});
	await MangaAdminService.registerManga({
		idPlugin: 'test-fixture',
		title: 'algo',
	});

	await database.query(
		`INSERT INTO chapters("idChapterPlugin","pluginId","idManga","name","volume") VALUES
('ch-376','test-fixture',1,'Chapter capitulo-376','376'),
('ch-375','test-fixture',1,'Chapter capitulo-375','375'),
('ch-374','test-fixture',1,'Chapter capitulo-374','374');`,
	);
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

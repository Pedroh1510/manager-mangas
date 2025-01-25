import retry from 'async-retry';
import database from '../infra/database.js';
import CONFIG_ENV from '../infra/env.js';

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
	await database.query(
		`INSERT INTO "mangas"("title") VALUES('Black Clover'),('algo');`,
	);
	await database.query(
		`INSERT INTO "mangasPlugins"("idManga","idPlugin") VALUES(1,'leitordemanga'),(2,'leitordemanga');`,
	);
	await database.query(
		`INSERT INTO chapters("idChapterPlugin","pluginId","idManga","name","volume") VALUES
('/ler-manga/black-clover/portugues-pt-br/capitulo-376/','leitordemanga',1,'Chapter capitulo-376','376'),
('/ler-manga/black-clover/portugues-pt-br/capitulo-375/','leitordemanga',1,'Chapter capitulo-375','375'),
('/ler-manga/black-clover/portugues-pt-br/capitulo-374/','leitordemanga',1,'Chapter capitulo-374','374');`,
	);
}

const orchestrator = {
	waitForAllServices,
	webServiceAddress,
	clearDatabase,
	runMigrations,
	seedDatabase,
};

export default orchestrator;

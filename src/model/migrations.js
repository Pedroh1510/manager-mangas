import { resolve } from 'node:path';
import migrationRunner from 'node-pg-migrate';

import CONFIG_ENV from '../infra/env.js';
import database from '../infra/database.js';

const pathToMigrations = resolve('src', 'infra', 'migrations');
const defaultMigrationsOptions = {
	databaseUrl: CONFIG_ENV.DATABASE_URL,
	dryRun: true,
	dir: pathToMigrations,
	direction: 'up',
	migrationsTable: 'pgmigrations',
	verbose: false
};
async function dryRun() {
	let dbClient;
	try {
		dbClient = await database.getNewClient();

		const migrations = await migrationRunner({
			...defaultMigrationsOptions,
			dbClient,
			dryRun: true
		});
		await dbClient.end();
		return migrations;
	} catch (error) {
		await dbClient?.end();
		throw error;
	}
}
async function run() {
	let dbClient;
	try {
		dbClient = await database.getNewClient();
		const migrations = await migrationRunner({
			...defaultMigrationsOptions,
			dbClient,
			dryRun: false
		});
		await dbClient.end();
		return migrations;
	} catch (error) {
		await dbClient?.end();
		throw error;
	}
}

const MigrationsService = {
	dryRun,
	run
};
export default MigrationsService;

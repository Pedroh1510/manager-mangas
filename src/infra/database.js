import pg from 'pg';
import CONFIG_ENV from './env.js';
const { Client } = pg;

async function query(queryObject) {
	let client;

	try {
		client = await getNewClient();
		const result = await client.query(queryObject);
		return result;
	} catch (error) {
		console.error(error);
		throw error;
	} finally {
		await client?.end();
	}
}

async function getNewClient() {
	const client = new Client({
		host: CONFIG_ENV.POSTGRES_HOST,
		port: CONFIG_ENV.POSTGRES_PORT,
		database: CONFIG_ENV.POSTGRES_DB,
		user: CONFIG_ENV.POSTGRES_USER,
		password: CONFIG_ENV.POSTGRES_PASSWORD,
		application_name: CONFIG_ENV.APPLICATION_NAME,
		ssl: CONFIG_ENV.ENV === 'production'
	});
	await client.connect();
	return client;
}

const database = {
	query: query,
	getNewClient
};

export default database;

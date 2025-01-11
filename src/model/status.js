import database from '../infra/database.js';

async function getDatabaseStatus() {
	const databaseVersionResult = await database.query(`SHOW server_version;`);

	const databaseMaxConnectionsResult = await database.query(
		`SHOW max_connections;`
	);

	const databaseName = process.env.POSTGRES_DB;
	const databaseUsageConnectionsResult = await database.query({
		text: 'SELECT count(*) AS total FROM pg_stat_activity WHERE datname = $1;',
		values: [databaseName]
	});

	const databaseVersionValue = databaseVersionResult.rows[0].server_version;

	const databaseMaxConnections = parseInt(
		databaseMaxConnectionsResult.rows[0]?.max_connections ?? 0
	);

	const databaseOpenedConnections = parseInt(
		databaseUsageConnectionsResult.rows[0]?.total ?? 0
	);

	return {
		version: databaseVersionValue,
		maxConnections: databaseMaxConnections,
		openedConnections: databaseOpenedConnections
	};
}

const StatusService = {
	getDatabaseStatus
};

export default StatusService;

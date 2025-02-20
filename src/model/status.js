import sql from 'sql-bricks';
import database from '../infra/database.js';

async function getDatabaseStatus() {
	const databaseVersionResult = await database.query('SHOW server_version;');

	const databaseMaxConnectionsResult = await database.query(
		'SHOW max_connections;'
	);

	const databaseName = process.env.POSTGRES_DB;

	const databaseUsageConnectionsResult = await database.query(
		sql
			.select('count(*) as total')
			.from('pg_stat_activity')
			.where({ datname: databaseName })
			.toParams()
	);

	const databaseVersionValue = databaseVersionResult.rows[0].server_version;

	const databaseMaxConnections = Number.parseInt(
		databaseMaxConnectionsResult.rows[0]?.max_connections ?? 0
	);

	const databaseOpenedConnections = Number.parseInt(
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

import database from '../infra/database.js';
import { getBackgroundQueue } from './queue/backgroundQueue.js';

const CHECK_TIMEOUT_MS = 2000;

/**
 * Builds the dependency probe behind GET /health. The container HEALTHCHECK hits it,
 * so Coolify only swaps in a new deploy when Postgres and Redis are reachable.
 * @example const check = createHealthCheck({ pingDatabase, pingRedis }); const { healthy } = await check();
 */
export function createHealthCheck({
	pingDatabase,
	pingRedis,
	timeoutMs = CHECK_TIMEOUT_MS,
}) {
	return async function checkHealth() {
		const [databaseCheck, redisCheck] = await Promise.all([
			runCheck('database', pingDatabase, timeoutMs),
			runCheck('redis', pingRedis, timeoutMs),
		]);
		return {
			healthy: databaseCheck === 'ok' && redisCheck === 'ok',
			checks: { database: databaseCheck, redis: redisCheck },
		};
	};
}

async function runCheck(name, probe, timeoutMs) {
	try {
		await withTimeout(probe(), timeoutMs, name);
		return 'ok';
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) };
	}
}

function withTimeout(promise, ms, name) {
	let timer;
	const timeout = new Promise((_resolve, reject) => {
		timer = setTimeout(
			() => reject(new Error(`${name} check timed out after ${ms}ms`)),
			ms,
		);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const HealthService = {
	check: createHealthCheck({
		pingDatabase: () => database.query('SELECT 1;'),
		// getVersion round-trips to Redis through the queue's existing connection.
		pingRedis: () => getBackgroundQueue().getVersion(),
	}),
};

export default HealthService;

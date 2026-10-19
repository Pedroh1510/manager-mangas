import { describe, expect, test } from 'vitest';
import { createHealthCheck } from '../../../service/health.js';
import FakeProbe from '../../fakes/FakeProbe.js';

function arrange({ timeoutMs } = {}) {
	const database = new FakeProbe();
	const redis = new FakeProbe();
	const check = createHealthCheck({
		pingDatabase: database.ping,
		pingRedis: redis.ping,
		timeoutMs,
	});
	return { check, database, redis };
}

describe('health check', () => {
	test('is healthy when Postgres and Redis answer', async () => {
		const { check, database, redis } = arrange();

		const result = await check();

		expect(result).toStrictEqual({
			healthy: true,
			checks: { database: 'ok', redis: 'ok' },
		});
		expect([database.calls, redis.calls]).toStrictEqual([1, 1]);
	});

	test('reports the Postgres error and is unhealthy', async () => {
		const { check, database } = arrange();
		database.failWith('connection refused');

		const result = await check();

		expect(result).toStrictEqual({
			healthy: false,
			checks: { database: { error: 'connection refused' }, redis: 'ok' },
		});
	});

	test('reports the Redis error and is unhealthy', async () => {
		const { check, redis } = arrange();
		redis.failWith('ECONNREFUSED');

		const result = await check();

		expect(result).toStrictEqual({
			healthy: false,
			checks: { database: 'ok', redis: { error: 'ECONNREFUSED' } },
		});
	});

	test('times out a dependency that hangs', async () => {
		const { check, redis } = arrange({ timeoutMs: 20 });
		redis.hang();

		const result = await check();

		expect(result.healthy).toBe(false);
		expect(result.checks.redis).toStrictEqual({
			error: 'redis check timed out after 20ms',
		});
	});
});

import { spawn } from 'node:child_process';
import retry from 'async-retry';
import { beforeAll, describe, expect, test } from 'vitest';
import {
	listConnectorIds,
	registerForTests,
} from '../../../connectors/registry.js';
import TestFixtureConnector from '../../../connectors/testFixture/TestFixtureConnector.js';
import orchestrator from '../../orchestrator.js';

const COUNT_KEYS = [
	'active',
	'completed',
	'delayed',
	'failed',
	'paused',
	'waiting',
];

beforeAll(async () => {
	// The API under test runs with ENV=test, which registers test-fixture; the
	// test process must do the same so both sides list the same connectors.
	registerForTests('test-fixture', TestFixtureConnector);
	await orchestrator.waitForAllServices();
});

describe('GET /queues-summary', () => {
	test('returns job counts for every registered queue', async () => {
		const response = await fetch(
			`${orchestrator.webServiceAddress}/queues-summary`,
		);
		const body = await response.json();

		expect(response.status).toEqual(200);
		const expectedNames = [
			...listConnectorIds().map((id) => `connector-${id}`),
			'background-tasks',
			'download',
		].sort();
		expect(body.map((item) => item.name).sort()).toEqual(expectedNames);
		for (const { counts } of body) {
			expect(Object.keys(counts).sort()).toEqual(COUNT_KEYS);
			for (const value of Object.values(counts)) {
				expect(Number.isInteger(value) && value >= 0).toBe(true);
			}
		}
	});

	test('responds 503 when redis is unreachable', async () => {
		// A second API whose Redis points at a closed port: getJobCounts never
		// settles there, so only the summary timeout can answer the request.
		const port = '3004';
		const unreachableRedisApi = spawn('node', ['src/server.js'], {
			env: { ...process.env, ENV: 'test', PORT: port, REDIS_PORT: '1' },
			stdio: 'ignore',
		});
		try {
			const baseUrl = `http://localhost:${port}`;
			await retry(
				async () => {
					const status = await fetch(`${baseUrl}/status`);
					if (status.status !== 200) throw new Error(`status ${status.status}`);
				},
				{ retries: 50, minTimeout: 200, maxTimeout: 500 },
			);

			const response = await fetch(`${baseUrl}/queues-summary`, {
				signal: AbortSignal.timeout(10000),
			});

			expect(response.status).toEqual(503);
			expect(await response.json()).toMatchObject({
				message: 'Queue backend unavailable',
			});
		} finally {
			unreachableRedisApi.kill('SIGKILL');
		}
	});
});

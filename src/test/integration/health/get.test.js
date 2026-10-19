import { beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../orchestrator.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
});

describe('GET /health', () => {
	test('returns 200 with Postgres and Redis ok', async () => {
		const response = await fetch(`${orchestrator.webServiceAddress}/health`);

		expect(response.status).toEqual(200);
		expect(await response.json()).toStrictEqual({
			status: 'ok',
			checks: { database: 'ok', redis: 'ok' },
		});
	});
});

import { beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../orchestrator.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.runMigrations();
});

describe('GET /status', () => {
	test('', async () => {
		const response = await fetch(`${orchestrator.webServiceAddress}/status`);
		expect(response.status).toEqual(200);
		const body = await response.json();
		expect(body).toEqual({
			version: '16.7',
			maxConnections: 100,
			openedConnections: 1
		});
	});
});

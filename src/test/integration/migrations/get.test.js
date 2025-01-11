import { beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../orchestrator.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
});

describe('GET /migrations', () => {
	test('', async () => {
		const response = await fetch(
			`${orchestrator.webServiceAddress}/migrations`
		);
		expect(response.status).toEqual(200);
		const body = await response.json();
		expect(body?.length).toBeGreaterThanOrEqual(1);
	});
});

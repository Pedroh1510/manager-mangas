import { beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../orchestrator.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
});

describe('POST /migrations', () => {
	test('', async () => {
		const response = await fetch(
			`${orchestrator.webServiceAddress}/migrations`,
			{
				method: 'POST',
			},
		);
		expect(response.status).toEqual(201);
		const body = await response.json();
		expect(body?.length).toBeGreaterThanOrEqual(1);
	});
});

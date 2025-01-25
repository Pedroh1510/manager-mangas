import { beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../../../orchestrator.js';
import api from '../../../../../infra/api.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
	await orchestrator.seedDatabase();
});

describe.concurrent('POST /mangas/adm/cookie', () => {
	test('Set  cookie', async () => {
		const response = await api.post('/mangas/adm/cookie', {
			title: 'Black Clover',
			idPlugin: 'leitordemanga'
		});

		expect(response.status).toEqual(201);
	});
	test('Set  cookie', async () => {
		const response = await api
			.post('/mangas/adm/cookie', {
				title: 'Black Clover',
				idPlugin: 'leitordemanga1'
			})
			.catch((error) => ({ status: error.status, data: error.response?.data }));

		expect(response.status).toEqual(400);
		expect(response.data).toEqual({
			name: 'ValidationError',
			message: 'Plugin with id leitordemanga1 not found',
			action: 'Entre em contato com o suporte',
			statusCode: 400
		});
	});
});

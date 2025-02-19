import { beforeAll, describe, expect, test } from 'vitest';
import api from '../../../../../infra/api.js';
import orchestrator from '../../../../orchestrator.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
	await orchestrator.seedDatabase();
});

describe('POST /mangas/adm/cookie', () => {
	describe('OK', () => {
		test('Set  cookie', async () => {
			const response = await api.post('/mangas/adm/cookie', {
				cookie: 'algo',
				idPlugin: 'leitordemanga'
			});

			expect(response.status).toEqual(201);
		});
		test('Set  cookie and agent', async () => {
			const response = await api.post('/mangas/adm/cookie', {
				cookie: 'algo',
				userAgent: 'test',
				idPlugin: 'leitordemanga'
			});

			expect(response.status).toEqual(201);
		});
	});
	describe('error', () => {
		test('missing', async () => {
			const response = await api
				.post('/mangas/adm/cookie', {
					title: 'Black Clover',
					idPlugin: 'leitordemanga1'
				})
				.catch((error) => ({
					status: error.status,
					data: error.response?.data
				}));

			expect(response.status).toEqual(400);

			expect(response.data).toEqual({
				name: 'ValidationError',
				message: '"body.cookie" is required',
				action: 'Verifique a request e tente novamente.',
				statusCode: 400
			});
		});
	});
});

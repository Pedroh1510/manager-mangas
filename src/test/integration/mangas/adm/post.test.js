import { beforeAll, describe, expect, test } from 'vitest';
import api from '../../../../infra/api.js';
import orchestrator from '../../../orchestrator.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
});

describe('POST /mangas/adm', () => {
	test('OK', async () => {
		const response = await api
			.post('/mangas/adm', {
				title: 'teste',
				idPlugin: 'seitacelestial',
			})
			.catch((error) => ({
				status: error.status,
				data: error.response?.data,
			}));

		expect(response.status).toEqual(201);
		expect(response.data).toEqual({
			idManga: 1,
			idPlugin: 'seitacelestial',
		});
	});
	describe('Error', () => {
		test('idPlugin invalid', async () => {
			const response = await api
				.post('/mangas/adm', {
					title: 'teste',
					idPlugin: 'algo',
				})
				.catch((error) => ({
					status: error.status,
					data: error.response?.data,
				}));
			expect(response.status).toEqual(400);
			expect(response.data).toEqual({
				action: 'Change plugin id',
				message: 'Plugin with id algo not found',
				name: 'ValidationError',
				statusCode: 400,
			});
		});
		test('duplicated', async () => {
			const consulta = () =>
				api
					.post('/mangas/adm', {
						title: 'duplicado',
						idPlugin: 'hipercool',
					})
					.catch((error) => ({
						status: error.status,
						data: error.response?.data,
					}));
			await consulta();
			const response = await consulta();
			expect(response.status).toEqual(400);
			expect(response.data).toEqual({
				action: 'Try another title or idPlugin',
				message: 'This manga already exists in the database',
				name: 'BadRequestError',
				statusCode: 400,
			});
		});
	});
});

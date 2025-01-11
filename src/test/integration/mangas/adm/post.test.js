import { beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../../orchestrator.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
});

describe('POST /mangas/adm', () => {
	test('OK', async () => {
		const response = await fetch(
			`${orchestrator.webServiceAddress}/mangas/adm`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					title: 'teste',
					idPlugin: 'hipercool'
				})
			}
		);
		expect(response.status).toEqual(201);
		const body = await response.json();
		expect(body).toEqual({
			idManga: 1,
			idPlugin: 'hipercool'
		});
	});
	describe('Error', () => {
		test('idPlugin invalid', async () => {
			const response = await fetch(
				`${orchestrator.webServiceAddress}/mangas/adm`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						title: 'teste',
						idPlugin: 'algo'
					})
				}
			);
			expect(response.status).toEqual(400);
			const body = await response.json();
			expect(body).toEqual({
				action: 'Change plugin id',
				message: 'Plugin with id algo not found',
				name: 'ValidationError',
				statusCode: 400
			});
		});
		test('duplicated', async () => {
			await fetch(`${orchestrator.webServiceAddress}/mangas/adm`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					title: 'duplicado',
					idPlugin: 'hipercool'
				})
			});
			const response = await fetch(
				`${orchestrator.webServiceAddress}/mangas/adm`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						title: 'duplicado',
						idPlugin: 'hipercool'
					})
				}
			);
			expect(response.status).toEqual(400);
			const body = await response.json();
			expect(body).toEqual({
				action: 'Try another title or idPlugin',
				message: 'This manga already exists in the database',
				name: 'BadRequestError',
				statusCode: 400
			});
		});
	});
});

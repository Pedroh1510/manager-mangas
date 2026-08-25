import { beforeAll, describe, expect, test } from 'vitest';
import api from '../../../../infra/api.js';
import orchestrator from '../../../orchestrator.js';
import AdmUtils from './utils.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
});

const admUtils = new AdmUtils();

describe('POST /mangas/adm', () => {
	test('OK', async () => {
		const response = await admUtils.createManga({ title: 'teste' });

		expect(response.status).toEqual(201);
		expect(response.data).toEqual({ idManga: expect.any(Number) });
	});

	describe('Error', () => {
		test('duplicated title', async () => {
			await admUtils.createManga({ title: 'duplicado' });
			const response = await admUtils.createManga({ title: 'duplicado' });

			expect(response.status).toEqual(400);
			expect(response.data).toEqual({
				action: 'Try another title or idPlugin',
				message: 'This manga already exists in the database',
				name: 'BadRequestError',
				statusCode: 400,
			});
		});

		test('title of a soft-deleted manga', async () => {
			const { data: manga } = await admUtils.createManga({
				title: 'Black Clover',
			});
			await api.delete(`/mangas/adm/${manga.idManga}`);

			const response = await admUtils.createManga({ title: 'Black Clover' });

			expect(response.status).toEqual(400);
			expect(response.data).toEqual({
				action: 'Try another title',
				message: 'This manga already exists in the database history',
				name: 'BadRequestError',
				statusCode: 400,
			});
		});
	});
});

describe('POST /mangas/adm/:idManga/connectors', () => {
	test('OK', async () => {
		const { data: manga } = await admUtils.createManga({ title: 'One Piece' });

		const response = await admUtils.linkConnector({
			idManga: manga.idManga,
			idPlugin: 'test-fixture',
			idMangaPlugin: '1',
			titlePlugin: 'One Piece',
		});

		expect(response.status).toEqual(201);
		expect(response.data).toEqual({
			idMangaConnector: expect.any(Number),
			idManga: manga.idManga,
			idPlugin: 'test-fixture',
		});
	});

	test('idPlugin invalid', async () => {
		const { data: manga } = await admUtils.createManga({
			title: 'invalid plugin case',
		});

		const response = await admUtils.linkConnector({
			idManga: manga.idManga,
			idPlugin: 'algo',
		});

		expect(response.status).toEqual(400);
		expect(response.data).toEqual({
			action: 'Change plugin id',
			message: 'Plugin with id algo not found',
			name: 'ValidationError',
			statusCode: 400,
		});
	});

	test('duplicated link', async () => {
		const { data: manga } = await admUtils.createManga({ title: 'dup link' });
		await admUtils.linkConnector({ idManga: manga.idManga });

		const response = await admUtils.linkConnector({ idManga: manga.idManga });

		expect(response.status).toEqual(400);
		expect(response.data).toEqual({
			action: 'Try another idManga or idPlugin',
			message: 'This manga is already linked to this connector',
			name: 'BadRequestError',
			statusCode: 400,
		});
	});
});

import { beforeAll, describe, expect, test } from 'vitest';
import api from '../../../infra/api.js';
import ConnectorSwitch from '../../../service/connectorSwitch.js';
import orchestrator from '../../orchestrator.js';
import AdmUtils from './adm/utils.js';

const admUtils = new AdmUtils();
const DISABLED_MESSAGE = 'Connector mangeek is disabled: teste';

function settle(request) {
	return request
		.then(({ status, data }) => ({ status, data }))
		.catch((error) => ({
			status: error.status,
			data: error.response?.data,
		}));
}

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
	await ConnectorSwitch.disableConnector({
		idPlugin: 'mangeek',
		reason: 'teste',
	});
});

describe('disabled connector', () => {
	test('GET /mangas/:pluginId returns 409', async () => {
		const response = await settle(api.get('/mangas/mangeek?title=x'));

		expect(response.status).toBe(409);
		expect(response.data.message).toBe(DISABLED_MESSAGE);
	});

	test('GET /mangas/:pluginId/manga returns 409', async () => {
		const response = await settle(api.get('/mangas/mangeek/manga?mangaId=1'));

		expect(response.status).toBe(409);
	});

	test('GET /mangas/:pluginId/cover/:id returns 409', async () => {
		const response = await settle(api.get('/mangas/mangeek/cover/1'));

		expect(response.status).toBe(409);
	});

	test('POST /mangas/adm/catalog/:idPlugin/refresh returns 409', async () => {
		const response = await settle(
			api.post('/mangas/adm/catalog/mangeek/refresh'),
		);

		expect(response.status).toBe(409);
	});

	test('POST /mangas/adm/covers/sync?idPlugin returns 409', async () => {
		const response = await settle(
			api.post('/mangas/adm/covers/sync?idPlugin=mangeek'),
		);

		expect(response.status).toBe(409);
	});

	test('linking a manga to the connector returns 409', async () => {
		const { data: manga } = await admUtils.createManga({ title: 'Solo' });

		const response = await admUtils.linkConnector({
			idManga: manga.idManga,
			idPlugin: 'mangeek',
		});

		expect(response.status).toBe(409);
	});

	test('cookie stays editable', async () => {
		const response = await settle(
			api.post('/mangas/adm/cookie', { idPlugin: 'mangeek', cookie: 'c=1' }),
		);

		expect(response.status).toBe(201);
	});

	test('GET /mangas/plugins flags each connector', async () => {
		const { data } = await api.get('/mangas/plugins');

		expect(data).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: 'mangeek', enabled: false }),
				expect.objectContaining({ id: 'wicomix', enabled: false }),
				expect.objectContaining({ id: 'nexustoons', enabled: true }),
			]),
		);
	});
});

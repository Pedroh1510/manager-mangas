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

describe('DELETE /mangas/adm/:idManga', () => {
	test('OK', async () => {
		const { data: manga } = await admUtils.createManga({ title: 'Black Clover' });
		await admUtils.linkConnector({ idManga: manga.idManga });

		const response = await api.delete(`/mangas/adm/${manga.idManga}`);
		expect(response.status).toEqual(200);

		const connectorsAfter = await api.get(`/mangas/adm/${manga.idManga}/connectors`);
		expect(connectorsAfter.data).toEqual([expect.objectContaining({ isActive: false })]);

		const listAfter = await api.get('/mangas/adm', { params: { title: 'Black Clover' } });
		expect(listAfter.data).toEqual([]);
	});
});

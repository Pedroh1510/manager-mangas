import { beforeAll, describe, expect, test } from 'vitest';
import api from '../../../../../../infra/api.js';
import orchestrator from '../../../../../orchestrator.js';
import AdmUtils from '../../utils.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
});

const url = '/mangas/adm/update-mangas/batch';
const admUtils = new AdmUtils();

describe(`GET ${url}`, () => {
	test('OK', async () => {
		const idPlugin = 'test-fixture';
		const { data: manga } = await admUtils.createManga({
			title: 'Black Clover',
		});
		await admUtils.linkConnector({
			idManga: manga.idManga,
			idPlugin,
			idMangaPlugin: '1',
		});

		const response = await api.get(url, { params: { idPlugin } });
		expect(response.status).toBe(200);
		expect(response.data).toStrictEqual({ [manga.idManga]: 2 });
	});
});

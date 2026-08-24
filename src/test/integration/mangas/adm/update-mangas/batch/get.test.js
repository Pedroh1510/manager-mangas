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
		// TestFixtureConnector's catalog only knows one manga ('Black Clover',
		// id '1'), with two chapters (ch-376, ch-375) — register against that
		// title so the connector's catalog lookup in listChaptersByTitle
		// actually matches something.
		await admUtils.registerManga({
			idPlugin,
			title: 'Black Clover',
		});
		const response = await api.get(url, {
			params: {
				idPlugin,
			},
		});
		expect(response.status).toBe(200);

		expect(response.data).toStrictEqual({
			'black clover': 2,
		});
	});
});

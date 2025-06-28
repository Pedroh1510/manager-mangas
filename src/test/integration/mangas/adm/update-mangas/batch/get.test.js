import { beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../../../../orchestrator.js';
import api from '../../../../../../infra/api.js';
import AdmUtils from '../../utils.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	// await orchestrator.clearDatabase();
	// await orchestrator.runMigrations();
	// await orchestrator.seedDatabase();
});

const url = '/mangas/adm/update-mangas/batch';
const admUtils = new AdmUtils();

describe(`GET ${url}`, () => {
	test('OK', async () => {
		const idPlugin = 'hipercool';
		const titles = ['Pick Me Up!', 'The Return of the Iron-Blood Sword Hound'];
		for (const title of titles) {
			await admUtils.registerManga({
				idPlugin,
				title
			});
		}
		const response = await api.get(url, {
			params: {
				idPlugin
			}
		});
		expect(response.status).toBe(200);

		expect(response.data).toStrictEqual({
			'pick me up!': 5,
			'the return of the iron-blood sword hound': 5
		});
	});
});

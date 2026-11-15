import { beforeEach, describe, expect, test } from 'vitest';
import api from '../../../../../infra/api.js';
import database from '../../../../../infra/database.js';
import orchestrator from '../../../../orchestrator.js';
import AdmUtils from '../utils.js';

const admUtils = new AdmUtils();
const WICOMIX_REASON = 'site mudou layout/paywall; parser quebrado (PR #47)';

function settle(request) {
	return request
		.then(({ status, data }) => ({ status, data }))
		.catch((error) => ({ status: error.status, data: error.response?.data }));
}

async function linkMangeek(title, isActive) {
	const { data } = await admUtils.createManga({ title });
	await admUtils.linkConnector({
		idManga: data.idManga,
		idPlugin: 'mangeek',
		idMangaPlugin: title,
	});
	await database.query({
		text: 'UPDATE "mangaConnectors" SET "isActive" = $1 WHERE "idManga" = $2',
		values: [isActive, data.idManga],
	});
	return data.idManga;
}

const findSwitch = (list, id) => list.find((item) => item.id === id);

beforeEach(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
});

describe('GET /mangas/adm/connector-switches', () => {
	test('lists every registry connector with its state', async () => {
		const { status, data } = await api.get('/mangas/adm/connector-switches');

		expect(status).toBe(200);
		expect(data.map((item) => item.id)).toEqual(
			[...data.map((item) => item.id)].sort(),
		);
		expect(findSwitch(data, 'wicomix')).toMatchObject({
			enabled: false,
			disabledReason: WICOMIX_REASON,
			disabledAt: expect.any(String),
		});
		expect(findSwitch(data, 'mangeek')).toMatchObject({
			enabled: true,
			disabledAt: null,
			disabledReason: null,
			url: expect.any(String),
		});
	});

	test('counts active links per connector', async () => {
		await linkMangeek('a', true);
		await linkMangeek('b', true);
		await linkMangeek('c', false);

		const { data } = await api.get('/mangas/adm/connector-switches');

		expect(findSwitch(data, 'mangeek').activeLinks).toBe(2);
	});
});

describe('PUT /mangas/adm/connector-switches/:idPlugin', () => {
	test('disables with reason then enables', async () => {
		const off = await settle(
			api.put('/mangas/adm/connector-switches/mangeek', {
				enabled: false,
				reason: 'fora do ar',
			}),
		);
		const afterOff = await api.get('/mangas/adm/connector-switches');
		await api.put('/mangas/adm/connector-switches/mangeek', { enabled: true });
		const afterOn = await api.get('/mangas/adm/connector-switches');

		expect(off.status).toBe(204);
		expect(findSwitch(afterOff.data, 'mangeek')).toMatchObject({
			enabled: false,
			disabledReason: 'fora do ar',
		});
		expect(findSwitch(afterOn.data, 'mangeek')).toMatchObject({
			enabled: true,
			disabledReason: null,
		});
	});

	test('rejects non-boolean enabled', async () => {
		const response = await settle(
			api.put('/mangas/adm/connector-switches/mangeek', { enabled: 'no' }),
		);

		expect(response.status).toBe(400);
	});

	test('rejects reason over 200 chars', async () => {
		const response = await settle(
			api.put('/mangas/adm/connector-switches/mangeek', {
				enabled: false,
				reason: 'x'.repeat(201),
			}),
		);

		expect(response.status).toBe(400);
	});

	test('rejects unknown plugin', async () => {
		const response = await settle(
			api.put('/mangas/adm/connector-switches/nope', { enabled: false }),
		);

		expect(response.status).toBe(400);
		expect(response.data.message).toBe('Plugin with id nope not found');
	});
});

describe('GET /mangas/adm connector state per link', () => {
	test('flags links whose connector is disabled', async () => {
		await linkMangeek('Solo', true);
		await api.put('/mangas/adm/connector-switches/mangeek', {
			enabled: false,
			reason: 'fora do ar',
		});

		const { data } = await api.get('/mangas/adm');

		expect(data[0].connectors[0]).toMatchObject({
			idPlugin: 'mangeek',
			isActive: true,
			connectorEnabled: false,
			connectorDisabledAt: expect.any(String),
			connectorDisabledReason: 'fora do ar',
		});
	});
});

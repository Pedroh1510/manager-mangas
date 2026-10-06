import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import api from '../../../../../infra/api.js';
import orchestrator from '../../../../orchestrator.js';
import AdmUtils from '../utils.js';

const admUtils = new AdmUtils();

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
	await orchestrator.seedDatabase();
});

async function patchAll(idManga, body) {
	return api
		.patch(`/mangas/adm/${idManga}/connectors`, body)
		.catch((error) => error.response);
}

async function listLinks(idManga) {
	const { data } = await api.get(`/mangas/adm/${idManga}/connectors`);
	return data.map(({ idPlugin, isActive }) => ({ idPlugin, isActive }));
}

let sequence = 0;
async function createMangaWithMixedLinks() {
	sequence += 1;
	const { data } = await admUtils.createManga({ title: `Misto ${sequence}` });
	await admUtils.linkConnector({
		idManga: data.idManga,
		idPlugin: 'test-fixture',
		idMangaPlugin: `mix-tf-${sequence}`,
		titlePlugin: 'Misto TF',
	});
	await admUtils.linkConnector({
		idManga: data.idManga,
		idPlugin: 'mangeek',
		idMangaPlugin: `mix-mg-${sequence}`,
		titlePlugin: 'Misto MG',
	});
	await api.patch(`/mangas/adm/${data.idManga}/connectors/mangeek`, {
		isActive: false,
	});
	return data.idManga;
}

describe('PATCH /mangas/adm/:idManga/connectors', () => {
	test('deactivates every connector link of a manga', async () => {
		const idManga = await createMangaWithMixedLinks();

		const response = await patchAll(idManga, { isActive: false });

		expect(response.status).toEqual(200);
		expect(response.data).toEqual({ idManga, isActive: false, updated: 2 });
		expect(await listLinks(idManga)).toEqual([
			{ idPlugin: 'mangeek', isActive: false },
			{ idPlugin: 'test-fixture', isActive: false },
		]);
	});

	test('activates every connector link including previously inactive ones', async () => {
		const idManga = await createMangaWithMixedLinks();

		const response = await patchAll(idManga, { isActive: true });

		expect(response.status).toEqual(200);
		expect(response.data).toEqual({ idManga, isActive: true, updated: 2 });
		expect(await listLinks(idManga)).toEqual([
			{ idPlugin: 'mangeek', isActive: true },
			{ idPlugin: 'test-fixture', isActive: true },
		]);
	});

	test('responds 404 for an unknown manga', async () => {
		const response = await patchAll(999999, { isActive: false });

		expect(response.status).toEqual(404);
		expect(response.data.message).toEqual('Manga 999999 not found');
	});

	test('responds 404 for a soft-deleted manga without touching its links', async () => {
		const idManga = await createMangaWithMixedLinks();
		await api.delete(`/mangas/adm/${idManga}`);

		const response = await patchAll(idManga, { isActive: true });

		expect(response.status).toEqual(404);
		expect(response.data.message).toEqual(`Manga ${idManga} not found`);
		expect(await listLinks(idManga)).toEqual([
			{ idPlugin: 'mangeek', isActive: false },
			{ idPlugin: 'test-fixture', isActive: false },
		]);
	});

	test('responds 400 when the manga has no connector links', async () => {
		const { data } = await admUtils.createManga({ title: 'Sem Links' });

		const response = await patchAll(data.idManga, { isActive: true });

		expect(response.status).toEqual(400);
		expect(response.data.message).toEqual(
			`Manga ${data.idManga} has no connector links`,
		);
	});

	test('responds 400 for invalid input', async () => {
		const idManga = await createMangaWithMixedLinks();
		const before = await listLinks(idManga);

		const responses = await Promise.all([
			patchAll(idManga, {}),
			patchAll(idManga, { isActive: 'yes' }),
			api
				.patch('/mangas/adm/abc/connectors', { isActive: true })
				.catch((error) => error.response),
		]);

		expect(responses.map((response) => response.status)).toEqual([
			400, 400, 400,
		]);
		expect(await listLinks(idManga)).toEqual(before);
	});
});

describe('PATCH /mangas/adm/:idManga/connectors without schema', () => {
	afterAll(async () => {
		await orchestrator.runMigrations();
	});

	test('responds 500 when the database query fails', async () => {
		await orchestrator.clearDatabase();

		const response = await patchAll(1, { isActive: true });

		expect(response.status).toEqual(500);
	});
});

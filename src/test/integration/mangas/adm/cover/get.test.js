import { readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import api from '../../../../../infra/api.js';
import CONFIG_ENV from '../../../../../infra/env.js';
import orchestrator from '../../../../orchestrator.js';
import FakeImageServer from '../../../../fakes/FakeImageServer.js';
import AdmUtils from '../utils.js';

// The API and this suite share the working directory (same container), so
// they see the same appdata/ and the API reaches the fake on 127.0.0.1.
const catalogPath = path.resolve('appdata', 'mangas.test-fixture.json');
const localCoversFolder = path.resolve('appdata', 'covers');
const fixtureCatalog = JSON.stringify({
	version: 2,
	mangas: [{ id: '1', title: 'Black Clover' }],
});
const localCoverPath = (idManga) =>
	path.join(localCoversFolder, `${idManga}.webp`);

// Titles are unique per run; the API keeps cover failures in memory.
const run = Date.now().toString(36);
const admUtils = new AdmUtils();
let images;

function getCover(idManga) {
	return fetch(`${CONFIG_ENV.URL}/mangas/adm/${idManga}/cover`);
}

async function createLinkedManga(name, idMangaPlugin) {
	const { data } = await admUtils.createManga({ title: `${name} ${run}` });
	await admUtils.linkConnector({ idManga: data.idManga, idMangaPlugin });
	return data.idManga;
}

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.runMigrations();
	await rm(localCoversFolder, { recursive: true, force: true });
	images = await FakeImageServer.start();
	await writeFile(
		catalogPath,
		JSON.stringify({
			version: 2,
			mangas: [
				{
					id: `with-cover-${run}`,
					title: 'Com capa',
					coverUrl: images.url('/cover.png'),
				},
				{
					id: `deleted-${run}`,
					title: 'Removida',
					coverUrl: images.url('/other.png'),
				},
				{ id: `without-cover-${run}`, title: 'Sem capa' },
				{ id: `stored-${run}`, title: 'Armazenada' },
			],
		}),
	);
});

afterAll(async () => {
	await images.stop();
	await writeFile(catalogPath, fixtureCatalog);
	await rm(localCoversFolder, { recursive: true, force: true });
});

describe('GET /mangas/adm/:idManga/cover', () => {
	test('responds 200 with the stored local cover', async () => {
		const idManga = await createLinkedManga('Armazenada', `stored-${run}`);
		const stored = Buffer.from('stored-webp-bytes');
		await mkdir(localCoversFolder, { recursive: true });
		await writeFile(localCoverPath(idManga), stored);

		const response = await getCover(idManga);

		expect(response.status).toEqual(200);
		expect(response.headers.get('content-type')).toEqual('image/webp');
		expect(response.headers.get('cache-control')).toEqual(
			'public, max-age=86400',
		);
		expect(Buffer.from(await response.arrayBuffer())).toEqual(stored);
	});

	test('responds 404 when no connector has a cover', async () => {
		const idManga = await createLinkedManga('Sem capa', `without-cover-${run}`);

		const response = await getCover(idManga);

		expect(response.status).toEqual(404);
		expect(await response.text()).toEqual('');
	});

	test('responds 400 for a non positive integer idManga', async () => {
		const reference = await fetch(`${CONFIG_ENV.URL}/mangas/adm/abc/chapters`);
		const referenceBody = await reference.json();
		expect(reference.status).toEqual(400);

		for (const idManga of ['abc', '0', '-1']) {
			const response = await getCover(idManga);
			const body = await response.json();

			expect(response.status).toEqual(400);
			expect(Object.keys(body).toSorted()).toEqual(
				Object.keys(referenceBody).toSorted(),
			);
			expect(body).toMatchObject({
				name: 'ValidationError',
				action: 'Verifique a request e tente novamente.',
			});
			expect(body.message).toContain('idManga');
		}
	});

	test('responds 404 for an unknown idManga', async () => {
		const response = await getCover(999999);

		expect(response.status).toEqual(404);
	});

	test('linking a connector creates the local cover', async () => {
		const requestsBefore = images.requestCount('/cover.png');

		const idManga = await createLinkedManga('Vinculada', `with-cover-${run}`);

		await vi.waitFor(() => stat(localCoverPath(idManga)), {
			timeout: 10000,
			interval: 200,
		});
		expect(images.requestCount('/cover.png')).toEqual(requestsBefore + 1);
	});

	test('soft delete keeps the local cover', async () => {
		const idManga = await createLinkedManga('Removida', `deleted-${run}`);
		await vi.waitFor(() => stat(localCoverPath(idManga)), {
			timeout: 10000,
			interval: 200,
		});
		const before = await readFile(localCoverPath(idManga));

		const response = await api.delete(`/mangas/adm/${idManga}`);

		expect(response.status).toEqual(200);
		expect(await readFile(localCoverPath(idManga))).toEqual(before);
	});
});

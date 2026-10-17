import { createHash } from 'node:crypto';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from 'vitest';
import CONFIG_ENV from '../../../../../infra/env.js';
import orchestrator from '../../../../orchestrator.js';
import FakeImageServer from '../../../../fakes/FakeImageServer.js';

// The API and this suite share the working directory (same container), so
// they see the same appdata/ and the API reaches the fake on 127.0.0.1.
const catalogPath = path.resolve('appdata', 'mangas.test-fixture.json');
const coverFolder = path.resolve('appdata', 'covers-catalog', 'test-fixture');
const fixtureCatalog = JSON.stringify({
	version: 2,
	mangas: [{ id: '1', title: 'Black Clover' }],
});
const sha1 = (value) => createHash('sha1').update(value).digest('hex');

let images;

// The API keeps failures in memory for 24h, so every test uses its own id,
// suffixed per run so a second run against the same API starts clean.
const run = Date.now().toString(36);
const idOf = (name) => `${name}-${run}`;
function writeCatalog(mangas) {
	return writeFile(catalogPath, JSON.stringify({ version: 2, mangas }));
}

function getCover(idMangaPlugin, pluginId = 'test-fixture') {
	return fetch(`${CONFIG_ENV.URL}/mangas/${pluginId}/cover/${idMangaPlugin}`);
}

async function connectorQueueCounts() {
	const response = await fetch(`${CONFIG_ENV.URL}/queues-summary`);
	const summary = await response.json();
	return summary.find(({ name }) => name === 'connector-test-fixture')?.counts;
}

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.runMigrations();
	images = await FakeImageServer.start();
});

beforeEach(() => rm(coverFolder, { recursive: true, force: true }));

afterAll(async () => {
	await images.stop();
	await writeFile(catalogPath, fixtureCatalog);
	await rm(coverFolder, { recursive: true, force: true });
});

describe('GET /mangas/:pluginId/cover/:idMangaPlugin', () => {
	test('responds 200 with a 300px webp of the catalog cover', async () => {
		await writeCatalog([
			{ id: idOf('ok-1'), title: 'A', coverUrl: images.url('/cover.png') },
		]);

		const response = await getCover(idOf('ok-1'));

		expect(response.status).toEqual(200);
		expect(response.headers.get('content-type')).toEqual('image/webp');
		expect(response.headers.get('cache-control')).toEqual(
			'public, max-age=86400',
		);
		const { format, width } = await sharp(
			Buffer.from(await response.arrayBuffer()),
		).metadata();
		expect(format).toEqual('webp');
		expect(width).toEqual(300);
	});

	test('serves the second request from the catalog cover cache', async () => {
		await writeCatalog([
			{ id: idOf('ok-2'), title: 'A', coverUrl: images.url('/other.png') },
		]);

		await getCover(idOf('ok-2'));
		const second = await getCover(idOf('ok-2'));

		expect(second.status).toEqual(200);
		expect(images.requestCount('/other.png')).toEqual(1);
		const stored = await readFile(
			path.join(coverFolder, `${sha1(idOf('ok-2'))}.webp`),
		);
		expect(Buffer.from(await second.arrayBuffer())).toEqual(stored);
	});

	test('responds 400 for an unknown plugin', async () => {
		const response = await getCover('1', 'nao-existe');

		expect(response.status).toEqual(400);
		expect(await response.json()).toMatchObject({
			name: 'ValidationError',
			message: 'Plugin with id nao-existe not found',
		});
	});

	test('responds 404 without fetching when the catalog has no cover', async () => {
		const before = await connectorQueueCounts();
		const requestsBefore = images.totalRequests();

		await rm(catalogPath, { force: true });
		const noCatalog = await getCover(idOf('none-1'));
		await writeCatalog([{ id: idOf('none-2'), title: 'Sem capa' }]);
		const missingId = await getCover('999');
		const noCoverUrl = await getCover(idOf('none-2'));

		for (const response of [noCatalog, missingId, noCoverUrl]) {
			expect(response.status).toEqual(404);
			expect(await response.text()).toEqual('');
		}
		expect(images.totalRequests()).toEqual(requestsBefore);
		expect(await connectorQueueCounts()).toEqual(before);
	});

	test('responds 404 when the upstream cover fails', async () => {
		await writeCatalog([
			{ id: idOf('broken-1'), title: 'A', coverUrl: images.url('/404') },
		]);

		const response = await getCover(idOf('broken-1'));

		expect(response.status).toEqual(404);
		expect(images.requestCount('/404')).toEqual(1);
		await expect(readdir(coverFolder)).rejects.toThrow();
	});

	test('a traversal id stays inside the plugin cover folder', async () => {
		await writeCatalog([
			{ id: idOf('ok-3'), title: 'A', coverUrl: images.url('/cover.png') },
		]);

		const response = await getCover('..%2F..%2Fetc%2Fpasswd');

		expect(response.status).toEqual(404);
		await expect(
			readFile(path.resolve('appdata', '..', 'etc', 'passwd.webp')),
		).rejects.toThrow();
		await expect(readdir(coverFolder)).rejects.toThrow();
	});
});

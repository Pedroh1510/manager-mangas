import { afterEach, describe, expect, test } from 'vitest';
import { MAX_HEADER_BYTES, listenHttp } from '../../../infra/httpServer.js';

const okApp = (_req, res) => res.end('ok');

let server;

afterEach(async () => {
	await new Promise((resolve) => server?.close(resolve) ?? resolve());
	server = undefined;
});

function listenOnFreePort() {
	return new Promise((resolve) => {
		server = listenHttp(okApp, 0, () => resolve(server.address().port));
	});
}

async function statusForPathLength(port, length) {
	const path = `/?pages=${'a'.repeat(length)}`;
	const response = await fetch(`http://127.0.0.1:${port}${path}`);
	return response.status;
}

describe('listenHttp', () => {
	// A 244-page chapter on GET /mangas/download is a ~27 KB URL; Node's
	// 16 KiB default answered 431 (wicomix Round 2 verification, 2026-10-25).
	test('accepts a request line over the Node 16 KiB default', async () => {
		const port = await listenOnFreePort();

		expect(await statusForPathLength(port, 30_000)).toBe(200);
	});

	test('rejects headers beyond MAX_HEADER_BYTES with 431', async () => {
		const port = await listenOnFreePort();

		expect(await statusForPathLength(port, MAX_HEADER_BYTES + 1)).toBe(431);
	});

	test('MAX_HEADER_BYTES is 64 KiB', () => {
		expect(MAX_HEADER_BYTES).toBe(64 * 1024);
	});
});

import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import api from '../../../../infra/api.js';
import orchestrator from '../../../orchestrator.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.runMigrations();
});

describe('GET /mangas/:pluginId', () => {
	describe('test-fixture', () => {
		// The API and this suite share the working directory (same container),
		// so they see the same appdata/ catalog file.
		const catalogPath = path.resolve('appdata', 'mangas.test-fixture.json');
		const fixtureCatalog = JSON.stringify([{ id: '1', title: 'Black Clover' }]);
		const freshCatalog = () => writeFile(catalogPath, fixtureCatalog);
		const waitForRewrittenCatalog = () =>
			vi.waitFor(
				async () => {
					expect(await readFile(catalogPath, 'utf8')).toEqual(fixtureCatalog);
				},
				{ timeout: 10000, interval: 200 },
			);

		beforeAll(freshCatalog);
		afterAll(freshCatalog);

		test('responds 200 with the cached catalog when it is fresh', async () => {
			const response = await api('/mangas/test-fixture/').then(
				({ status, data }) => ({ status, data }),
			);
			expect(response.status).toEqual(200);
			expect(response.data).toEqual([{ id: '1', title: 'Black Clover' }]);
		});

		test('responds 202 with an empty body when there is no cached catalog', async () => {
			await rm(catalogPath, { force: true });

			const response = await api('/mangas/test-fixture/');

			expect(response.status).toEqual(202);
			expect(response.data).toEqual('');
		});

		test('the background refresh rewrites the catalog after a 202', async () => {
			// Let the refresh queued by the previous test land first, or it
			// rewrites the file right after the rm below.
			await waitForRewrittenCatalog();
			await rm(catalogPath, { force: true });
			const first = await api('/mangas/test-fixture/');
			expect(first.status).toEqual(202);

			await waitForRewrittenCatalog();
			const second = await api('/mangas/test-fixture/');
			expect(second.status).toEqual(200);
			expect(second.data).toEqual([{ id: '1', title: 'Black Clover' }]);
		});
	});
	describe('Mangeek', () => {
		// This test does a full live crawl of geekstations.com.br's catalog
		// (cold cache: 42 tags via /discover, paginated and rate-limited).
		// Measured ~875s end to end, which would make `npm test` take 15+
		// minutes on every run for everyone, every time (the on-disk cache at
		// appdata/mangas.mangeek.json expires after 7 days — see
		// src/service/manga.js:127 — and is always absent on a fresh checkout
		// or in CI). Gated behind an opt-in env var so it's skipped by
		// default; run it on demand with:
		//   RUN_MANGEEK_CATALOG_CRAWL=1 npx vitest run src/test/integration/mangas/pluginId/get.test.js
		test.skipIf(!process.env.RUN_MANGEEK_CATALOG_CRAWL)(
			'',
			async () => {
				const response = await api('/mangas/mangeek/').then(
					({ status, data }) => ({ status, data }),
				);
				expect(response.status).toEqual(200);
				// Conservative lower bound from a full manual crawl on 2026-08-22
				// (42 tags via /discover, 9892 unique manga found) — see
				// docs/manager-mangas/mangageek/findings.md. The live catalog only
				// grows over time; this floor should stay valid.
				expect(response.data.length).toBeGreaterThanOrEqual(9880);
			},
			// Cold-cache first hit crawls all ~42 tags live (paginated, rate-limited
			// with a wait between pages inside the connector). Observed ~875s end
			// to end against the live API from this environment, well past the
			// suite's default 500s test timeout — give this one test more room.
			1200000,
		);
	});
});

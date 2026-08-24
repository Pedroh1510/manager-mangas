import { beforeAll, describe, expect, test } from 'vitest';
import api from '../../../../infra/api.js';
import orchestrator from '../../../orchestrator.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.runMigrations();
});

describe('GET /mangas/:pluginId', () => {
	describe('test-fixture', () => {
		test('', async () => {
			const response = await api('/mangas/test-fixture/').then(
				({ status, data }) => ({ status, data }),
			);
			expect(response.status).toEqual(200);
			expect(response.data).toEqual([{ id: '1', title: 'Black Clover' }]);
		});
	});
	describe('Mangeek', () => {
		// This test does a full live crawl of geekstations.com.br's catalog
		// (cold cache: 42 tags via /discover, paginated and rate-limited).
		// Measured ~875s end to end, which would make `npm test` take 15+
		// minutes on every run for everyone, every time (the on-disk cache at
		// appdata/shinigami.mangas.mangeek expires after 7 days — see
		// src/service/manga.js:220 — and is always absent on a fresh checkout
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

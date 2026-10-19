import { beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../../../../orchestrator.js';
import { call } from '../../suggestions/http.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
});

describe('POST /mangas/adm/covers/sync', () => {
	test('enqueues the sync of every connector without idPlugin', async () => {
		const { status, body } = await call('POST', '/mangas/adm/covers/sync');

		expect(status).toBe(202);
		expect(body).toStrictEqual({ idPlugin: null });
	});

	test('enqueues the sync of one registered connector', async () => {
		const { status, body } = await call(
			'POST',
			'/mangas/adm/covers/sync?idPlugin=nexustoons',
		);

		expect(status).toBe(202);
		expect(body).toStrictEqual({ idPlugin: 'nexustoons' });
	});

	test('responds 404 for an unknown idPlugin', async () => {
		const { status } = await call(
			'POST',
			'/mangas/adm/covers/sync?idPlugin=not-a-plugin',
		);

		expect(status).toBe(404);
	});

	test('responds 400 for an unknown query param', async () => {
		const { status } = await call('POST', '/mangas/adm/covers/sync?foo=1');

		expect(status).toBe(400);
	});
});

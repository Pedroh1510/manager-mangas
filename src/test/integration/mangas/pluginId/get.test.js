import { beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../../orchestrator.js';
import CONFIG_ENV from '../../../../infra/env.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
});

describe.concurrent('Manga', () => {
	describe('Leitordemanga', () => {
		test('', async () => {
			const response = await fetch(`${CONFIG_ENV.URL}/mangas/Leitordemanga/`);
			expect(response.status).toEqual(200);
			const body = await response.json();
			expect(body).toHaveLength(27);
		});
	});
	describe('HiperCool', () => {
		test('', async () => {
			const response = await fetch(`${CONFIG_ENV.URL}/mangas/HiperCool/`);
			expect(response.status).toEqual(200);
			const body = await response.json();
			expect(body).toHaveLength(13620);
		});
	});
	describe('seitacelestial', () => {
		test('', async () => {
			const response = await fetch(`${CONFIG_ENV.URL}/mangas/seitacelestial/`);
			expect(response.status).toEqual(200);
			const body = await response.json();
			expect(body).toHaveLength(108);
		});
	});
});

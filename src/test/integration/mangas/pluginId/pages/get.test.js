import { beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../../../orchestrator.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
});

describe.concurrent('Pages', () => {
	describe('Leitordemanga', () => {
		test('', async () => {
			const response = await fetch(
				'http://localhost:3001/mangas/Leitordemanga/pages?chapterId=/ler-manga/black-clover/portugues-pt-br/capitulo-376'
			);
			expect(response.status).toEqual(200);
			const body = await response.json();
			expect(body).toHaveLength(18);
		});
	});
	describe('HiperCool', () => {
		test('', async () => {
			const response = await fetch(
				'http://localhost:3001/mangas/HiperCool/pages?chapterId=/manga/regressed-warriors-female-dominance-diary/capitulo-01/'
			);
			expect(response.status).toEqual(200);
			const body = await response.json();
			expect(body).toHaveLength(38);
		});
	});
	describe('seitacelestial', () => {
		test('', async () => {
			const response = await fetch(
				'http://localhost:3001/mangas/seitacelestial/pages?chapterId=/919933087-chapter-01/'
			);
			expect(response.status).toEqual(200);
			const body = await response.json();
			expect(body).toHaveLength(59);
		});
	});
});

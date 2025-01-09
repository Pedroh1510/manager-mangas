import { describe, expect, test } from 'vitest';

describe.concurrent('Manga', () => {
	describe('Leitordemanga', () => {
		test('', async () => {
			const response = await fetch(
				'http://localhost:3001/mangas/Leitordemanga/manga?mangaId=/ler-manga/black-clover/'
			);
			expect(response.status).toEqual(200);
			const body = await response.json();
			expect(body).toHaveLength(378);
		});
	});
	describe.only('HiperCool', () => {
		test('', async () => {
			const response = await fetch(
				'http://localhost:3001/mangas/HiperCool/manga?mangaId=/manga/regressed-warriors-female-dominance-diary/'
			);
			expect(response.status).toEqual(200);
			const body = await response.json();
			expect(body).toHaveLength(49);
			console.log(body);
		});
	});
	describe('seitacelestial', () => {
		test('', async () => {
			const response = await fetch(
				'http://localhost:3001/mangas/seitacelestial/manga?mangaId=/comics/919933087/'
			);
			expect(response.status).toEqual(200);
			const body = await response.json();
			expect(body).toHaveLength(81);
			console.log(body);
		});
	});
});

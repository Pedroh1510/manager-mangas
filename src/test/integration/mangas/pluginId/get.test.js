import { beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../../orchestrator.js';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
});

describe.concurrent('Manga', () => {
	describe('Leitordemanga', () => {
		test('', async () => {
			const response = await fetch(
				'http://localhost:3001/mangas/Leitordemanga/'
			);
			expect(response.status).toEqual(200);
			const body = await response.json();
			expect(body).toHaveLength(27);
		});
	});
	describe('HiperCool', () => {
		test('', async () => {
			const response = await fetch('http://localhost:3001/mangas/HiperCool/');
			expect(response.status).toEqual(200);
			const body = await response.json();
			expect(body).toHaveLength(13620);
		});
	});
	// describe.only('sussyscan', () => {
	// 	test('', async () => {
	// 		const response = await fetch('http://localhost:3001/mangas/sussyscan/');
	// 		expect(response.status).toEqual(200);
	// 		const body = await response.json();
	// 		expect(body).toHaveLength(13620);
	// 	});
	// });
	describe('seitacelestial', () => {
		test('', async () => {
			const response = await fetch(
				'http://localhost:3001/mangas/seitacelestial/'
			);
			expect(response.status).toEqual(200);
			const body = await response.json();
			expect(body).toHaveLength(108);
			console.log(
				body.find(
					(item) => item.title === 'Sobrevivendo no Jogo Como um Bárbaro'
				)
			);
		});
	});
	// describe.only('imperiodabritannia', () => {
	// 	test('', async () => {
	// 		const response = await fetch(
	// 			'http://localhost:3001/mangas/imperiodabritannia/'
	// 		);
	// 		expect(response.status).toEqual(200);
	// 		const body = await response.json();
	// 		expect(body).toHaveLength(108);
	// 		console.log(
	// 			body.find(
	// 				(item) => item.title === 'Sobrevivendo no Jogo Como um Bárbaro'
	// 			)
	// 		);
	// 	});
	// });
});

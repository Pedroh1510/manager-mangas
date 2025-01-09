import axios from 'axios';
import { describe, expect, test } from 'vitest';

describe('', () => {
	test('', async () => {
		// const pages = [
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/2.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/3.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/4.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/5.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/6.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/7.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/8.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/9.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/10.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/11.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/12.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/13.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/14.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/15.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/16.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/17.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/18.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/19.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/20.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/21.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/22.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/23.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/24.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/25.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/26.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/27.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/28.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/29.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/30.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/31.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/32.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/33.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/34.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/35.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/36.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/37.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/38.jpg',
		// 	'https://cdn.hipercool.xyz/manga_66720df64f8ba/f062e12ee8597158668c9d1db9b57952/39.jpg'
		// ];
		// const { status } = await axios.get(
		// 	'http://localhost:3001/mangas/download',
		// 	{ params: { pages, chapter: '', manga: 'teste' } }
		// );
		// expect(status).toEqual(200);
		const title = 'Regressed Warrior’s Female Dominance Diary';
		const responseManga = await fetch(
			'http://localhost:3001/mangas/HiperCool/'
		);
		expect(responseManga.status).toEqual(200);
		const bodyManga = await responseManga.json();
		expect(bodyManga).toHaveLength(13620);
		const manga = bodyManga.find((item) => item.title === title);
		expect(manga).toBeDefined();

		console.log({ manga });

		const responseChapters = await fetch(
			`http://localhost:3001/mangas/HiperCool/manga?mangaId=${manga.id}`
		);
		expect(responseChapters.status).toEqual(200);
		const chapters = await responseChapters.json();
		expect(chapters).toHaveLength(49);
		console.log({ chapters });

		for (const chapter of chapters) {
			console.log({ chapter });
			const responseChapter = await fetch(
				`http://localhost:3001/mangas/HiperCool/pages?chapterId=${chapter.id}`
			);
			expect(responseChapter.status).toEqual(200);
			const pages = await responseChapter.json();
			const { status } = await axios.get(
				'http://localhost:3001/mangas/download',
				{ params: { pages, chapter: chapter.title, manga: title } }
			);
			expect(status).toEqual(200);
		}
	});
});

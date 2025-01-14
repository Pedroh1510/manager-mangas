import Connector from '../engine/Connector.mjs';
import Manga from '../engine/Manga.mjs';

export default class TopToonCO extends Connector {
	constructor() {
		super();
		super.id = 'toptoonco';
		super.label = 'TOPTOON (탑툰)';
		this.tags = ['webtoon', 'korean'];
		this.url = 'https://toptoon.com.co';
		this.links = {
			login: 'https://toptoon.com/login'
		};
		this.cookie =
			'cf_clearance=0syv6fzOVoJQWT3zULjjAthgt6KSBuT.5M_tUo27lQ8-1736820860-1.2.1.1-GDc.qWZqSLtF_gPYBJw_jSUSqfET8DpqYEphCy6v0lR6CwHp1f6BnS5XFUVXsWuNq9BH.VMBvN02c_JX_WS.AZumbDzkT5NBAwWkZgAjC3BD4_AjfLVwKohg_hw1MoOkUTnqTfaMx7wIL0RyPgSo4q7OaHc2JrVBAgQOIEaXQZr3E_l921MaFxjURRjekUVX.OKbZaa7N4AbIxysEsnyEK8mkfY39M2D0Znmhi3CyxwbTesC6muhy0snHKzn__FGBR0FDXwDCrqOZJ7W.Ktfil6CVxWywrrAzGdhrgq912g; XSRF-TOKEN=eyJpdiI6IloxRHpxTFB1MmdHZTIrbVF2d2svSVE9PSIsInZhbHVlIjoiNEgyeWp4dVhvWkQvbTIwblgrWkJGc0ZQTzBYL0ZYRHFWcW9oeHlvSjBrRkpaOWxJMTRTaHFuaUhoeEZZYkxKc2pibjlZKzVqMXF2M2xDeDgwYTZ6b1JXVmlUUUw2aEx3YzhGTitLdnc2Qmx6Nk41NGRNOWJFcWRjWm1obTVUeHAiLCJtYWMiOiIwNDAyM2I4YjhjMjg2N2IyMDk3YjA5N2IwMzE0NzYxNWI5MGRmMWUxODRjYmYwNDczMWEzMGIzMzY0MjUwOGI5IiwidGFnIjoiIn0%3D; blackoutcomics_session=eyJpdiI6InhpSE9tY2hBWUlrMFlUbUZ6MzBGbWc9PSIsInZhbHVlIjoicjQ4WnhiZm41MnZvTzVGdVBmU2lDd1MzMkhMemY1MGtBc2szMmlpeHVOMWNxOEtjWVhvU3JOUmJJbFQ0R0p5MTNaT2NQU0NIODVBdjlGSWExeG4xdlMwTWpMNGExOHFqU1o5aWVmZ3BtRzBjSmhuR0tCZGtPdks1bkFsZndlbmwiLCJtYWMiOiJlMzRkNDQ4ODU1MTVjOGU0ZGZjMGVmYzliNDYxYTZlMGVhYjk4OGI4OWNkYmY3ZDNlM2U2NjJiOGNmYWE3ZTYzIiwidGFnIjoiIn0%3D';
	}
	async _getMangaFromURI(uri) {
		const request = new Request(uri, this.requestOptions);
		const data = await this.fetchDOM(
			request,
			'div.ep_comic_info span.comic_tit span'
		);
		return new Manga(this, uri.pathname, data[0].textContent.trim());
	}

	async _getMangas() {
		let request, data;

		let mangas = [];

		try {
			this.requestOptions.headers.set('cookie', this.cookie);
			request = new Request(new URL('/comics', this.url), this.requestOptions);
			data = await this.fetchDOM(
				request,
				'#main-wrapper > section.anime.blackout > div > div > div > div > a'
			);

			for (let manga of data) {
				const text = manga.querySelector('span');
				const a = {
					id: manga?.pathname,
					title: text?.textContent
						?.trim()
						?.replace(/\s+\d{2}(?: Final)?$/, '')
						?.trim()
				};
				mangas.push(a);
			}
		} catch (error) {}

		return mangas;
	}

	async _getChapters(manga) {
		this.requestOptions.headers.set('cookie', this.cookie);

		const request = new Request(
			new URL(manga.id, this.url),
			this.requestOptions
		);
		const data = await this.fetchDOM(
			request,
			'#capitulosList > h5 > a:nth-child(3)'
		);
		const returnData = [];
		for (const element of data) {
			const ch = await Promise.resolve([...element.children]);
			const isVip = ch.some((item) => item.outerHTML.includes('class="vip"'));
			if (isVip) continue;
			const dataFormatted = {
				id: element.pathname,
				title: element.textContent.trim(),
				language: 'pt'
			};
			returnData.push(dataFormatted);
		}
		return returnData;
	}

	async _getPages(chapter) {
		this.requestOptions.headers.set('cookie', this.cookie);
		const request = new Request(
			new URL(chapter.id, this.url),
			this.requestOptions
		);
		const data = await this.fetchDOM(
			request,
			'#main-wrapper > section.chapter.blackout > div > div.img-capitulos.pt-4 > div > div > canvas'
		);
		return data.map((element) => {
			return this.getAbsolutePath(
				element.outerHTML
					.split('"')
					.find((item) => item.includes('/assets/obras/')),
				request.url
			);
		});
	}
}

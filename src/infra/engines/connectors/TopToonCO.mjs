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
				if (a.title?.includes('...')) {
					request = new Request(new URL(a.id, this.url), this.requestOptions);
					const newTitle = await this.fetchDOM(
						request,
						'#main-wrapper > section.video.bg-mobile > div > div > div.col-lg-9.col-12 > div > div.col-lg-8.col-md-5.col-12 > div > h2:nth-child(2)'
					);
					a.title = newTitle[0]?.textContent ?? a.title;
				}
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

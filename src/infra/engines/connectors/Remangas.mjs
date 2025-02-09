import Connector from '../engine/Connector.mjs';

export default class Remangas extends Connector {
	constructor() {
		super();
		super.id = 'remangas';
		super.label = 'Remangas';
		this.tags = ['manga', 'portuguese'];
		this.url = 'https://remangas.net';

		this.language = 'pt';
	}

	init() {
		this.requestOptions.headers.set('referer', this.url);
		this.requestOptions.headers.set('cookie', this.cookie);
		this.requestOptions.headers.set(
			'User-Agent',
			'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:129.0) Gecko/20100101 Firefox/129.0'
		);
	}

	async _getMangas() {
		let page = 1;
		let morePages = true;

		let request, data;

		let mangas = [];
		this.init();

		while (morePages) {
			try {
				request = new Request(
					new URL('/manga/page/' + page, this.url),
					this.requestOptions
				);
				data = await this.fetchDOM(
					request,
					'div.post-title.font-title > h3 > a'
				);
				page++;

				for (let manga of data) {
					const item = manga;
					const a = {
						id: item?.pathname,
						title: item?.textContent
							?.trim()
							?.replace(/\s+\d{2}(?: Final)?$/, '')
							?.trim()
					};
					mangas.push(a);
				}
				if (!data?.length) morePages = false;
			} catch (error) {
				morePages = false;
			}
		}

		return mangas;
	}

	async _getChapters(manga) {
		this.init();
		let request = new Request(new URL(manga.id, this.url), this.requestOptions);
		let data = await this.fetchDOM(
			request,
			'#tab-chapter-listing > div > div > ul > li > a'
		);

		return data.map((element) => {
			return {
				id: this.getRootRelativeOrAbsoluteLink(element, this.url),
				title:
					'Chapter ' +
					element.textContent
						?.trim()
						?.replace(/[\n|\t]/, '')
						?.trim(),
				language: 'pt'
			};
		});
	}

	async _getPages(chapter) {
		this.init();
		const request = new Request(
			new URL(chapter.id, this.url),
			this.requestOptions
		);
		const data = await this.fetchDOM(
			request,
			'div.reading-content > div > source'
		);
		return data.map((element) => {
			return this.getAbsolutePath(element, request.url);
		});
	}
}

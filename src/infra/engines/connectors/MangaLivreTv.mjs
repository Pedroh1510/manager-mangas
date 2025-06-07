import Connector from '../engine/Connector.mjs';
import Manga from '../engine/Manga.mjs';

export default class MangaLivreTv extends Connector {
	constructor() {
		super();
		super.id = 'mangalivretv';
		super.label = 'MangaLivreTv';
		this.tags = ['manga', 'portuguese'];
		this.url = 'https://mangalivre.tv';
	}

	init() {
		this.requestOptions.headers.set('referer', this.url);
		this.requestOptions.headers.set('cookie', this.cookie);
		this.requestOptions.headers.set('User-Agent', this.userAgent);
	}
	async _getMangas() {
		this.init();
		let page = 1;
		let morePages = true;

		let request, data;

		let mangas = [];
		do {
			try {
				request = new Request(
					new URL('/page/' + page, this.url),
					this.requestOptions
				);
				data = await this.fetchDOM(
					request,
					'div.manga__item > div > div > div:nth-child(1) > h2 > a'
				);
				page++;

				for (let manga of data) {
					const item = {
						id: manga?.pathname,
						title: manga?.textContent
							?.trim()
							?.replace(/\s+\d{2}(?: Final)?$/, '')
							?.trim()
					};
					mangas.push(item);
				}
				if (!data?.length) morePages = false;
			} catch (error) {
				morePages = false;
			}
		} while (morePages);

		return mangas;
	}

	async _getChapters(manga) {
		this.init();
		let request = new Request(
			new URL(manga.id + 'ajax/chapters/', this.url),
			this.requestOptions
		);
		let data = await this.fetchDOMMethod({
			request,
			selector: 'li.wp-manga-chapter > a:nth-child(1)',
			method: 'POST'
		});

		return data.map((element) => {
			return {
				id: this.getRootRelativeOrAbsoluteLink(element, this.url),
				title:
					'Chapter ' +
					element.pathname
						.split('/')
						.filter((element) => element !== '')
						.pop(),
				language: 'pt'
			};
		});
	}

	async _getPages(chapter) {
		let request = new Request(
			new URL(chapter.id, this.url),
			this.requestOptions
		);
		let data = await this.fetchDOM(request, 'div.page-break>source');
		return data
			.map((item) => item.src ?? item['data-src'])
			.filter((item) => item);
	}

	async _getMangaFromURI(uri) {
		let request = new Request(new URL(uri.href), this.requestOptions);
		let data = await this.fetchDOM(request, '.title-bar span');
		return new Manga(this, uri.pathname, data[0].textContent);
	}
}

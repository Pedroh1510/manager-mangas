import Connector from '../engine/Connector.mjs';
import Manga from '../engine/Manga.mjs';

export default class HiperCool extends Connector {
	constructor() {
		super();
		super.id = 'hipercool';
		super.label = 'Hiper Cool';
		this.tags = ['manga', 'portuguese', 'hentai'];
		this.url = 'https://hiper.cool';
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

		while (morePages) {
			try {
				request = new Request(
					new URL('/page/' + page, this.url),
					this.requestOptions
				);
				data = await this.fetchDOM(
					request,
					'#loop-content > div > div > div > div > div.item-summary > div.post-title.font-title > h3'
				);
				page++;

				for (let manga of data) {
					const item = manga.querySelector('a');
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
		let data = await this.fetchDOM(request, 'li.wp-manga-chapter > a');
		if (!data.length) {
			data = await this.fetchDOM(request, '*');
			const response = await fetch(request.url + 'ajax/chapters/?t=1', {
				method: 'POST'
			}).catch(() => null);
			if (response === null) return [];
			const a = await response.text();
			return a
				.split('"')
				.filter((item) => item.includes(request.url))
				.map((item) => ({
					id: item.replace('https://hiper.cool', ''),
					title: item
						.split('/')
						.filter((item) => item)
						.pop(),
					language: 'pt'
				}));
		}

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
		this.init();
		let request = new Request(
			new URL(chapter.id, this.url),
			this.requestOptions
		);
		let data = await this.fetchDOM(request, 'div > source');
		return data
			.map((item) => {
				const value = item.src ?? item['data-src'];
				if (value) return;
				return item?.outerHTML
					?.split('"')
					?.find((element) => element.includes('https'))
					?.trim();
			})
			.filter((item) => item);
	}

	async _getMangaFromURI(uri) {
		let request = new Request(new URL(uri.href), this.requestOptions);
		let data = await this.fetchDOM(request, '.title-bar span');
		return new Manga(this, uri.pathname, data[0].textContent);
	}
}

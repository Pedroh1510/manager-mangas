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

	async _getMangas() {
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
		let data = await this.fetchDOM(request, 'div > source');
		return data.map((element) => this.getAbsolutePath(element, request.url));
	}

	async _getMangaFromURI(uri) {
		let request = new Request(new URL(uri.href), this.requestOptions);
		let data = await this.fetchDOM(request, '.title-bar span');
		return new Manga(this, uri.pathname, data[0].textContent);
	}
}

import { setTimeout } from 'node:timers/promises';
import Connector from '../engine/Connector.mjs';
import Manga from '../engine/Manga.mjs';

export default class Neroxus extends Connector {
	constructor() {
		super();
		super.id = 'neroxus';
		super.label = 'Neroxus';
		this.tags = ['manga', 'portuguese', 'hentai'];
		this.url = 'https://neroxus.com.br';
	}

	async _getMangas() {
		let request = new Request(new URL(this.url), this.requestOptions);
		let data = await this.fetchDOM(
			request,
			'#loop-content > div > div > div > div > div.item-summary > div.post-title.font-title > h3 > a'
		);
		return data.map((element) => {
			return {
				id: element?.pathname,
				title: element?.textContent
					?.trim()
					?.replace(/\s+\d{2}(?: Final)?$/, '')
					?.trim()
			};
		});
	}

	async _getChapters(manga) {
		let request = new Request(new URL(manga.id, this.url), this.requestOptions);
		let data = await this.fetchDOM(
			request,
			'body > div.wrap > div > div.site-content > div > div.c-page-content.style-1 > div > div > div > div.main-col.col-md-8.col-sm-8 > div > div > div > div.page-content-listing.single-page > div > ul > li > a'
		);

		return data.map((element) => {
			return {
				id: this.getRootRelativeOrAbsoluteLink(element, this.url),
				title:
					'Chapter ' +
					element.textContent
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
		let data = await this.fetchDOM(
			request,
			'body > div.wrap > div > div.site-content > div > div > div > div > div > div > div.c-blog-post > div.entry-content > div > div > div > div > source'
		);
		return data.map((element) => this.getAbsolutePath(element, request.url));
	}

	async _getMangaFromURI(uri) {
		let request = new Request(new URL(uri.href), this.requestOptions);
		let data = await this.fetchDOM(request, '.title-bar span');
		return new Manga(this, uri.pathname, data[0].textContent);
	}
}

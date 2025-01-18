import Connector from '../engine/Connector.mjs';
import Manga from '../engine/Manga.mjs';

export default class Rfdragonscan extends Connector {
	constructor() {
		super();
		super.id = 'rfdragonscan';
		super.label = 'Rfdragonscan';
		this.tags = ['manga', 'portuguese', 'hentai'];
		this.url = 'https://rfdragonscan.com';
	}

	async _getMangas() {
		let request, data;

		let mangas = [];
		try {
			request = new Request(
				new URL('/todas-as-obras/', this.url),
				this.requestOptions
			);
			data = await this.fetchDOM(
				request,
				'body > main > section > div > a.titulo__comic__allcomics'
			);

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
		} catch (error) {}

		return mangas;
	}

	async _getChapters(manga) {
		let request = new Request(new URL(manga.id, this.url), this.requestOptions);
		let data = await this.fetchDOM(
			request,
			'body > main > section.capitulos__obra > ul > a'
		);

		return data.map((element) => {
			const title = element.querySelector('li > div > span');
			return {
				id: this.getRootRelativeOrAbsoluteLink(element, this.url),
				title: 'Chapter ' + title.textContent,
				language: 'pt'
			};
		});
	}

	async _getPages(chapter) {
		let request = new Request(
			new URL(chapter.id, this.url),
			this.requestOptions
		);
		let data = await this.fetchDOM(request, 'main');
		let pages = [];
		if (!data.length) return pages;
		const a = data[0].outerHTML
			.split('script')
			.find((element) => element.includes('/obras/'));
		if (a === undefined) return pages;
		pages = a.split("'").filter((element) => element.startsWith('/'));

		return pages.map((element) => this.getAbsolutePath(element, this.url));
	}

	async _getMangaFromURI(uri) {
		let request = new Request(new URL(uri.href), this.requestOptions);
		let data = await this.fetchDOM(request, '.title-bar span');
		return new Manga(this, uri.pathname, data[0].textContent);
	}
}

import Connector from '../engine/Connector.mjs';
import Manga from '../engine/Manga.mjs';

export default class ImperiodaBritannia extends Connector {
	constructor() {
		super();
		super.id = 'imperiodabritannia';
		super.label = 'ImperiodaBritannia';
		this.tags = ['manga', 'portuguese', 'hentai'];
		this.url = 'https://imperiodabritannia.com';
	}

	async _getMangas() {
		let page = 1;
		let morePages = true;

		let request, data;

		let mangas = [];

		while (morePages) {
			try {
				request = new Request(
					new URL('/projetos/page/' + page, this.url),
					this.requestOptions
				);
				data = await this.fetchDOM(
					request,
					'body > div.wrap > div > div.site-content > div > div > div > div > div.main-col.col-md-8.col-sm-8 > div.main-col-inner > div > div.c-page__content > div.tab-content-wrap > div > div > div > div > div > div > div.item-summary > div.post-title.font-title > h3 > a'
				);
				page++;

				for (let manga of data) {
					const item = manga;
					const a = {
						id: item?.pathname,
						title: item?.title
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
			'#chapterlist > ul > li > div > div > a'
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
		let data = await this.fetchDOM(request, '#readerarea > img');
		return data.map((element) => this.getAbsolutePath(element, request.url));
	}

	async _getMangaFromURI(uri) {
		let request = new Request(new URL(uri.href), this.requestOptions);
		let data = await this.fetchDOM(request, '.title-bar span');
		return new Manga(this, uri.pathname, data[0].textContent);
	}
}

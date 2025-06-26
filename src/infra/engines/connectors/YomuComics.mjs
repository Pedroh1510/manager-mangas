import Connector from '../engine/Connector.mjs';
import Manga from '../engine/Manga.mjs';

export default class YomuComics extends Connector {
	constructor() {
		super();
		super.id = 'yomucomics';
		super.label = 'YomuComics';
		this.tags = ['manga', 'portuguese'];
		this.url = 'https://yomucomics.com';
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
					'div.styletere > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > a:nth-child(1)'
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
		let request = new Request(new URL(manga.id, this.url), this.requestOptions);
		let data = await this.fetchDOMMethod({
			request,
			selector:
				'#chapterlist > ul:nth-child(1) > li > div:nth-child(1) > div:nth-child(1) > a:nth-child(1)'
		});

		return data.map((element) => {
			const titleObject = element.querySelector('span:nth-child(1)');
			return {
				id: this.getRootRelativeOrAbsoluteLink(element, this.url),
				title: 'Chapter ' + titleObject.textContent,
				language: 'pt'
			};
		});
	}

	async _getPages(chapter) {
		let request = new Request(
			new URL(chapter.id, this.url),
			this.requestOptions
		);
		let script = `
        new Promise( resolve => {
            resolve( [...document.querySelectorAll('#readerarea > img')].map(img => img.src) );
        } );
        `;
		const data = await Engine.Request.fetchUI(request, script);
		return data;
	}

	async _getMangaFromURI(uri) {
		let request = new Request(new URL(uri.href), this.requestOptions);
		let data = await this.fetchDOM(request, '.title-bar span');
		return new Manga(this, uri.pathname, data[0].textContent);
	}
}

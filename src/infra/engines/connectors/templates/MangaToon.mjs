import Connector from '../../engine/Connector.mjs';
import Manga from '../../engine/Manga.mjs';

export default class MangaToon extends Connector {
	constructor() {
		super();
		super.id = 'mangatoon';
		super.label = 'MangaToon';
		this.tags = [];
		this.url = undefined; // WEEX + VUE mobile app => https://h5.mangatoon.mobi
		this.baseURL = 'https://mangatoon.mobi';
		this.path = undefined;
		this.language = undefined;

		this.lockImage =
			'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGhlaWdodD0iMTAwIiB3aWR0aD0iMjAwIj48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZHk9IjAuMjVlbSIgZmlsbD0icmVkIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5DaGFwdGVyIGlzIExvY2tlZCE8L3RleHQ+PC9zdmc+';
	}

	/**
	 *
	 */
	get icon() {
		return '/img/connectors/mangatoon';
	}

	async _getMangaFromURI(uri) {
		let request = new Request(uri, this.requestOptions);
		let data = await this.fetchDOM(
			request,
			'div.detail-top h1.comics-title',
			3
		);
		let id = uri.pathname.replace('/episodes', '');
		let title = data[0].textContent.trim();
		return new Manga(this, id, title);
	}

	/**
	 *
	 */
	_getMangaListFromPages(mangaPageLinks, index) {
		index = index || 1;
		return this.fetchDOM(
			mangaPageLinks[index],
			'div.items div.item div.content-title',
			10
		).then((data) => {
			let mangaList = data.map((element) => {
				return {
					id: element.closest('a').href,
					title: element.textContent.trim()
				};
			});
			if (mangaList.length > 0 && index < mangaPageLinks.length - 1) {
				return this._getMangaListFromPages(mangaPageLinks, index + 1).then(
					(mangas) => mangaList.concat(mangas)
				);
			} else {
				return Promise.resolve(mangaList);
			}
		});
	}

	/**
	 *
	 */
	async _getMangaList() {
		return this.fetchDOM(this.baseURL + this.path, 'div.page div.next')
			.then(() => {
				let pageCount = 999;
				let pageLinks = [...new Array(pageCount).keys()].map(
					(page) => this.baseURL + this.path + page
				);
				return this._getMangaListFromPages(pageLinks);
			})
			.then((data) => {
				return data.map((item) => ({ ...item, language: this.language }));
			});
	}

	async _getChapters(manga) {
		const data = await this.fetchDOM(
			this.baseURL + manga.id + '/episodes',
			'div.episode-content-asc div.episodes-wrap a.episode-item, div.episode-content-asc div.episodes-wrap-new a.episode-item-new'
		);
		let chapterList = data.map((element) => {
			let title = element
				.querySelector('div.episode-title, div.episode-title-new:last-of-type')
				.textContent.replace(/\s+/g, ' ')
				.trim();
			return {
				id: element.href,
				title: title.replace(manga.title, '').trim(),
				language: this.language
			};
		});
		return chapterList;
	}

	async _getPages(chapter) {
		let request = new Request(this.baseURL + chapter.id, this.requestOptions);
		return fetch(request)
			.then((response) => response.text())
			.then((data) => {
				let pageList = [this.lockImage];
				let pictures = data.match(/pictures\s*=\s*(\[.+?\])\s*;/);
				if (pictures) {
					pictures = JSON.parse(pictures[1]);
					pageList = pictures.map((picture) => {
						let parts = picture.url
							.replace('/encrypted/', '/watermark/')
							.split('.');
						parts[parts.length - 1] = 'jpg';
						return this.getAbsolutePath(parts.join('.'), request.url);
					});
				}
				return pageList;
			})
			.catch((error) => {
				console.error(error, chapter);
				// callback(error, undefined);
			});
	}
}

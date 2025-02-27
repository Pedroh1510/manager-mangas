import Connector from '../engine/Connector.mjs';

export default class DiskusScan extends Connector {
	constructor() {
		super();
		super.id = 'diskusscan';
		super.label = 'Diskus Scan';
		this.tags = ['manga', 'webtoon', 'portuguese', 'scanlation'];
		this.url = 'https://diskusscan.online';
		this.retries = 5;
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
					'div.stylefiv > div > div > div > a',
					this.retries
				);
				page++;

				for (let manga of data) {
					const a = {
						id: manga?.pathname,
						title: manga?.textContent
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
			'#chapterlist > ul:nth-child(1) > li > div:nth-child(1) > div:nth-child(1) > a:nth-child(1)',
			this.retries
		);

		return data.map((element) => {
			return {
				id: element?.href?.replace(this.url, ''),
				title: 'Chapter ' + element.querySelector('span')?.textContent,
				language: 'pt'
			};
		});
	}

	async _getPages(chapter) {
		let request = new Request(
			new URL(chapter.id, this.url),
			this.requestOptions
		);
		let data = await this.fetchDOM(request, 'body');
		const aaa = data[0].outerHTML
			.replaceAll('><', '\n')
			.split('\n')
			.filter((item) => item.includes('data-large-file='))
			.map((item) =>
				item.split('"').find((element) => element.includes(this.url))
			);
		return aaa;
	}
}

import Connector from '../engine/Connector.mjs';

export default class SlimeRead extends Connector {
	constructor() {
		super();
		super.id = 'slimeread';
		super.label = 'SlimeRead';
		this.tags = ['manga', 'portuguese', 'hentai'];
		this.url = 'https://slimeread.com';
	}
	async _getMangaList() {
		const data = await this.fetchJSON(
			'https://tipaeupapai.slimeread.com:8443/book_search'
		);

		const mangas = data.map((item) => ({
			id: item.book_redirect_link ?? `/manga/${item.book_id}`,
			title: item.book_name_original
		}));
		const mangasNotDuplicated = {};
		for (const manga of mangas) {
			if (mangasNotDuplicated[manga.id]) continue;
			mangasNotDuplicated[manga.id] = manga;
		}
		return Object.values(mangasNotDuplicated);
	}

	async _getChapters({ id }) {
		const aa = id.split('/').pop();
		const data = await this.fetchJSON(
			`https://tipaeupapai.slimeread.com:8443/book_cap_units_all?manga_id=${aa}`
		);
		const chapters = data.map((item) => {
			return {
				id: `/ler/${aa}/cap-${item.btc_cap + 1}`,
				title: item.btc_cap + 1,
				language: 'pt'
			};
		});
		return chapters;
	}
}

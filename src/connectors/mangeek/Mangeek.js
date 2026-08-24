import { createHash } from 'node:crypto';
import Connector from '../Connector.js';

export default class Mangeek extends Connector {
	constructor() {
		super({
			id: 'mangeek',
			label: 'Mangeek',
			tags: ['manga', 'portuguese'],
			url: 'http://geekstations.com.br',
		});
	}

	init() {
		this.requestOptions = { headers: { accept: 'application/json' } };
	}

	_nonce() {
		return Date.now().toString(16).toUpperCase();
	}

	_keyGen(param) {
		return createHash('md5').update(`M<${param}#MANG33K>D`).digest('hex');
	}

	async _getAllTags() {
		this.init();
		const nonce = this._nonce();
		const key = this._keyGen(nonce);
		const request = new Request(
			new URL(`/api/v2/pt/home/${nonce}/${key}`, this.url),
			this.requestOptions,
		);
		const data = await this.fetchJSON(request);
		return data?.tags ?? [];
	}

	async _getMangas() {
		this.init();
		const tags = await this._getAllTags();
		const seen = new Map();

		for (const tag of tags) {
			let ignore = [];
			let morePages = true;
			while (morePages) {
				try {
					const nonce = this._nonce();
					const key = this._keyGen(nonce);
					const request = new Request(
						new URL(`/api/v2/pt/discover/${nonce}/${key}`, this.url),
						{
							...this.requestOptions,
							method: 'POST',
							body: JSON.stringify({ tags: [tag], ignore }),
						},
					);
					request.headers.set('content-type', 'application/json');
					const page = await this.fetchJSON(request);
					if (!page?.length) {
						morePages = false;
						break;
					}
					for (const manga of page) {
						seen.set(String(manga.id), {
							id: String(manga.id),
							title: manga.title,
						});
					}
					ignore = ignore.concat(page.map((manga) => manga.id));
					if (page.length < 25) {
						morePages = false;
					} else {
						await this.wait(500);
					}
				} catch (error) {
					morePages = false;
				}
			}
		}
		return [...seen.values()];
	}

	async _getChapters(manga) {
		this.init();
		const nonce = this._nonce();
		const key = this._keyGen(manga.id);
		const request = new Request(
			new URL(`/api/v2/pt/manga/${nonce}/${manga.id}/${key}`, this.url),
			this.requestOptions,
		);
		const data = await this.fetchJSON(request);
		return (data.chapters ?? []).map((chapter) => ({
			id: String(chapter.id),
			title: chapter.title,
			language: 'pt',
		}));
	}

	async _getPages(chapter) {
		this.init();
		const nonce = this._nonce();
		const key = this._keyGen(chapter.id);
		const request = new Request(
			new URL(`/api/v2/pt/chapter/${nonce}/${chapter.id}/${key}`, this.url),
			this.requestOptions,
		);
		const data = await this.fetchJSON(request);
		return data?.pages ?? [];
	}
}

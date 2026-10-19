import { cleanAltTitles } from '../utils/altTitles.js';

export default class Connector {
	constructor({ id, label, tags = [], url }) {
		this.id = id;
		this.label = label;
		this.tags = tags;
		this.url = url;
	}

	async initialize() {}

	wait(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async fetchJSON(request, retries = 0) {
		const response = await fetch(request);
		if (response.status >= 500 && retries > 0) {
			await this.wait(5000);
			return this.fetchJSON(request, retries - 1);
		}
		if (response.status === 200) {
			return response.json();
		}
		throw new Error(
			`Failed to receive content from "${request.url}" (status: ${response.status}) - ${response.statusText}`,
		);
	}

	/**
	 * Catalog entry in the connector contract; an empty or missing cover
	 * leaves `coverUrl` out instead of storing a value nothing can fetch, and
	 * `altTitles` is present only when something survives `cleanAltTitles`.
	 * @example this._toCatalogEntry(7, 'A', '', ['B']) // { id: '7', title: 'A', altTitles: ['B'] }
	 * @param {string|number} id
	 * @param {string} title
	 * @param {string|null|undefined} coverUrl
	 * @param {unknown[]} [altTitles]
	 * @returns {{id: string, title: string, coverUrl?: string, altTitles?: string[]}}
	 */
	_toCatalogEntry(id, title, coverUrl, altTitles = []) {
		const entry = { id: String(id), title };
		const withCover = coverUrl ? { ...entry, coverUrl } : entry;
		const cleaned = cleanAltTitles(title, altTitles);
		return cleaned.length ? { ...withCover, altTitles: cleaned } : withCover;
	}

	async _getMangas() {
		throw new Error(`${this.constructor.name} does not implement _getMangas()`);
	}

	async _getChapters(manga) {
		throw new Error(
			`${this.constructor.name} does not implement _getChapters()`,
		);
	}

	async _getPages(chapter) {
		throw new Error(`${this.constructor.name} does not implement _getPages()`);
	}
}

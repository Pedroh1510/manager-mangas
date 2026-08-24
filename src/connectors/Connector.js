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

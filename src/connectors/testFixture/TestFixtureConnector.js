import Connector from '../Connector.js';

export default class TestFixtureConnector extends Connector {
	constructor() {
		super({
			id: 'test-fixture',
			label: 'Test Fixture',
			tags: ['test'],
			url: 'http://test-fixture.invalid',
		});
	}

	async _getMangas() {
		return [{ id: '1', title: 'Black Clover' }];
	}

	async _getChapters(manga) {
		if (manga.id !== '1') return [];
		return [
			{ id: 'ch-376', title: 'Capítulo 376', language: 'pt' },
			{ id: 'ch-375', title: 'Capítulo 375', language: 'pt' },
		];
	}

	async _getPages(chapter) {
		return [`http://test-fixture.invalid/${chapter.id}/1.jpg`];
	}
}

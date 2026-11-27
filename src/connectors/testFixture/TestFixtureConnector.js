import Connector from '../Connector.js';

// Manga '3' lists 170, 171 and 177: 172-176 are missing, which the gap rule
// must hold back once 170/171 are stored.
const GAP_CHAPTERS = [170, 171, 177].map((volume) => ({
	id: `ch-${volume}`,
	title: `Capítulo ${volume}`,
	language: 'pt',
}));

// idMangaPlugin is UNIQUE per plugin, so tests needing 375/376 link a fresh id.
const BLACK_CLOVER_IDS = new Set(['1', '4', '5', '10', '15']);

// Manga '16' lists chapters whose page is an inline PNG, so a source
// replacement can download for real without any network host.
const INLINE_PAGE_MANGA_ID = '16';
const INLINE_PAGE_PREFIX = 'ok-';
const INLINE_PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

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
		if (manga.id === '3') return GAP_CHAPTERS;
		if (manga.id === INLINE_PAGE_MANGA_ID) {
			return [{ id: 'ok-376', title: 'Capítulo 376', language: 'pt' }];
		}
		if (!BLACK_CLOVER_IDS.has(manga.id)) return [];
		return [
			{ id: 'ch-376', title: 'Capítulo 376', language: 'pt' },
			{ id: 'ch-375', title: 'Capítulo 375', language: 'pt' },
		];
	}

	async _getPages(chapter) {
		if (chapter.id.startsWith(INLINE_PAGE_PREFIX)) return [INLINE_PNG];
		return [`http://test-fixture.invalid/${chapter.id}/1.jpg`];
	}
}

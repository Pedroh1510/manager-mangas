/**
 * In-memory `mangas` and `mangaConnectors` reads/writes the alt-titles
 * service needs; `writes` counts every `updateAltTitles`.
 * @example const store = new FakeAltTitlesStore([{ idManga: 1, title: 'A', altTitles: [] }]);
 */
export default class FakeAltTitlesStore {
	constructor(mangas = [], links = []) {
		this.mangas = new Map(mangas.map((manga) => [manga.idManga, manga]));
		this.links = links;
		this.writes = 0;
	}

	findMangaById = async ({ idManga }) => this.mangas.get(idManga) ?? null;

	updateAltTitles = async ({ idManga, altTitles }) => {
		this.writes += 1;
		const updated = { ...this.mangas.get(idManga), altTitles };
		this.mangas.set(idManga, updated);
		return updated;
	};

	listLinksByPlugin = async ({ idPlugin }) =>
		this.links.filter((link) => link.idPlugin === idPlugin);
}

/**
 * In-memory `coverSuggestions` writes for matching tests: `pending` holds the
 * last replacement per manga.
 * @example const suggestions = new FakeCoverSuggestions(); suggestions.pending.get(7) // [...]
 */
export default class FakeCoverSuggestions {
	constructor(mangasMissingConnectors = []) {
		this.mangasMissingConnectors = mangasMissingConnectors;
		this.pending = new Map();
		this.deletedItems = [];
	}

	listMangasMissingConnectors = async () => this.mangasMissingConnectors;

	replacePending = async ({ idManga, suggestions }) => {
		this.pending.set(idManga, suggestions);
	};

	deletePendingByItems = async ({ idPlugin, idMangaPlugins }) => {
		if (idMangaPlugins.length)
			this.deletedItems.push({ idPlugin, idMangaPlugins });
	};
}

/**
 * In-memory links for planDiscovery: each link lists fixed chapters, can be
 * slow (gated by a promise) or fail, and every record/held call is logged.
 * @example
 * const fake = new FakeDiscoveryLinks();
 * fake.addLink(1, [{ id: 'a', title: 'A', volume: '172' }]);
 * await planDiscovery({ links: fake.links(), ...fake.callbacks() });
 */
export default class FakeDiscoveryLinks {
	constructor() {
		this.entries = new Map();
		this.recorded = [];
		this.heldCalls = [];
		this.takenVolumes = new Set();
	}

	addLink(idMangaConnector, chapters, { gate = null, error = null } = {}) {
		this.entries.set(idMangaConnector, { chapters, gate, error });
	}

	links() {
		return [...this.entries.keys()].map((idMangaConnector) => ({
			idMangaConnector,
			idPlugin: `plugin-${idMangaConnector}`,
		}));
	}

	callbacks() {
		return {
			listLinkChapters: async (link) => this.#list(link),
			recordChapter: async ({ link, chapter }) => this.#record(link, chapter),
			reportHeld: ({ chapter, previousKnownVolume }) =>
				this.heldCalls.push({ volume: chapter.volume, previousKnownVolume }),
		};
	}

	recordedVolumes() {
		return this.recorded.map((entry) => entry.chapter.volume);
	}

	held() {
		return this.heldCalls;
	}

	async #list(link) {
		const entry = this.entries.get(link.idMangaConnector);
		if (entry.gate) await entry.gate;
		if (entry.error) throw entry.error;
		return entry.chapters;
	}

	#record(link, chapter) {
		if (this.takenVolumes.has(chapter.volume)) return null;
		this.takenVolumes.add(chapter.volume);
		this.recorded.push({ link, chapter });
		return { ...chapter, idMangaConnector: link.idMangaConnector };
	}
}

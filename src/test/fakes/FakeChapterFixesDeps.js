import { ConflictError } from '../../infra/errors.js';

/**
 * Records calls made by createChapterFixes. Build deps with `.asDeps()`.
 * Source-replace knobs: `links`, `sourceChapters` (by idPlugin; an Error
 * value makes that source fail), `disabled` (idPlugin -> reason),
 * `blockedKeys`, `downloadError`, `downloadGate` (a promise the download
 * awaits, to hold a replace in flight), `updateError`.
 * @example const deps = new FakeChapterFixesDeps({ chapter }); createChapterFixes(deps.asDeps())
 */
export default class FakeChapterFixesDeps {
	inserted = [];
	deleted = [];
	scanned = [];
	unblockedCount = 1;
	deleteError = null;
	links = [];
	sourceChapters = {};
	disabled = {};
	blockedKeys = new Set();
	pages = ['https://a.example/1.jpg'];
	access = { cookie: 'c=1', userAgent: 'UA' };
	downloadError = null;
	downloadGate = null;
	updateError = null;
	downloads = [];
	updated = [];
	fs = { renamed: [], removed: [] };
	#idsByPair = new Map();

	constructor({ chapter = null, scanResult = true } = {}) {
		this.chapter = chapter;
		this.scanResult = scanResult;
	}

	asDeps() {
		return {
			chapters: this.#chaptersRepo(),
			blocked: this.#blockedRepo(),
			deleteChapter: async (params) => {
				if (this.deleteError) throw this.deleteError;
				this.deleted.push(params);
			},
			scanSeries: async (params) => {
				this.scanned.push(params);
				return this.scanResult;
			},
			...this.#sourceDeps(),
		};
	}

	#chaptersRepo() {
		return {
			findChapterById: async () => this.chapter,
			updateChapterSource: async (params) => {
				if (this.updateError) throw this.updateError;
				this.updated.push(params);
			},
		};
	}

	#blockedRepo() {
		return {
			insertBlocked: async (row) => {
				this.inserted.push(row);
				const pair = `${row.idMangaConnector}:${row.idChapterPlugin}`;
				if (!this.#idsByPair.has(pair)) {
					this.#idsByPair.set(pair, 7 + this.#idsByPair.size);
				}
				return { idBlockedChapter: this.#idsByPair.get(pair) };
			},
			listBlockedByManga: async () => [],
			deleteBlocked: async () => this.unblockedCount,
			listBlockedKeysByManga: async () => this.blockedKeys,
		};
	}

	#sourceDeps() {
		return {
			connectors: { listConnectorsByManga: async () => this.links },
			source: {
				listChaptersByManga: async ({ idPlugin }) => {
					const listed = this.sourceChapters[idPlugin] ?? [];
					if (listed instanceof Error) throw listed;
					return listed;
				},
				listPages: async () => this.pages,
			},
			connectorSwitch: this.#connectorSwitch(),
			switches: this.#switches(),
			pluginAccess: { findPluginAccess: async () => this.access },
			download: { downloadChapter: (params) => this.#download(params) },
			chapterPath: ({ title, volume }) => `/d/${title}/${volume}.cbz`,
			randomId: () => 'u1',
			fs: {
				rename: async (from, to) => this.fs.renamed.push({ from, to }),
				rm: async (target) => this.fs.removed.push(target),
			},
		};
	}

	#connectorSwitch() {
		return {
			isConnectorEnabled: async (idPlugin) => !(idPlugin in this.disabled),
			assertConnectorEnabled: async (idPlugin) => {
				if (!(idPlugin in this.disabled)) return;
				throw new ConflictError({ message: `Connector ${idPlugin} off` });
			},
		};
	}

	#switches() {
		return {
			findSwitch: async ({ idPlugin }) => ({
				disabledAt: new Date(0),
				disabledReason: this.disabled[idPlugin] ?? null,
			}),
		};
	}

	async #download(params) {
		this.downloads.push(params);
		if (this.downloadGate) await this.downloadGate;
		if (this.downloadError) throw this.downloadError;
	}
}

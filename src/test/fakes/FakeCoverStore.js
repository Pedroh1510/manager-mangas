/**
 * In-memory cover store keyed by file path, with the same interface as
 * `coverStore`.
 * @example const store = new FakeCoverStore({ '/root/covers/7.webp': Buffer.from('x') });
 */
export default class FakeCoverStore {
	constructor(files = {}) {
		this.files = new Map(Object.entries(files));
		this.writes = [];
	}

	async read(filePath) {
		return this.files.get(filePath) ?? null;
	}

	async write(filePath, image) {
		this.writes.push(filePath);
		this.files.set(filePath, image);
	}

	async remove(filePath) {
		this.files.delete(filePath);
	}

	paths() {
		return [...this.files.keys()];
	}
}

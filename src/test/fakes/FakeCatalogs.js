/**
 * Catalog files by connector id; `reads` records every connector loaded.
 * @example new FakeCatalogs({ nexustoons: [{ id: 'a', title: 'A' }] }).load('nexustoons')
 */
export default class FakeCatalogs {
	constructor(catalogs = {}) {
		this.catalogs = catalogs;
		this.reads = [];
	}

	load = async (idPlugin) => {
		this.reads.push(idPlugin);
		return this.catalogs[idPlugin] ?? null;
	};
}

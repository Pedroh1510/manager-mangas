import path from 'node:path';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const plugins = {};
async function initMangas() {
	const PATH = path.resolve('src', 'infra', 'engines');
	const PLUGIN_PATH = path.join(PATH, 'connectors');

	const dom = new JSDOM('<!DOCTYPE html>');
	const { document } = dom.window;
	globalThis.document = document;
	const EngineRequest = (await import(`${PATH}/engine/Request.mjs`)).default;
	const Blacklist = (await import(`${PATH}/engine/Blacklist.mjs`)).default;
	const Settings = (await import(`${PATH}/engine/Settings.mjs`)).default;
	const Storage = (await import(`${PATH}/engine/Storage.mjs`)).default;
	const er = new EngineRequest();
	await er.setup();
	globalThis.Engine = {
		Request: er,
		Blacklist: new Blacklist(),
		Settings: new Settings(),
		Storage: new Storage()
	};
	function recFindByExt(base, ext, files, result) {
		files = files || fs.readdirSync(base);
		result = result || [];

		files.forEach((file) => {
			const newbase = path.join(base, file);
			if (fs.statSync(newbase).isDirectory()) {
				result = recFindByExt(newbase, ext, fs.readdirSync(newbase), result);
			} else {
				if (file.substr(-1 * (ext.length + 1)) === '.' + ext) {
					if (result) {
						result.push(newbase);
					}
				}
			}
		});
		return result;
	}
	function searchPluginsInFolder(folder) {
		return recFindByExt(folder, 'mjs');
	}

	async function loadPlugin(pluginPath) {
		return import(pluginPath);
	}
	const loadedPlugins = [];
	searchPluginsInFolder(PLUGIN_PATH).forEach((filePath) => {
		loadedPlugins.push(
			loadPlugin(filePath)
				.then((module) => {
					return {
						module,
						name: path.basename(filePath, path.extname(filePath))
					};
				})
				.catch((e) => {
					1;
				})
		);
	});

	await Promise.allSettled(loadedPlugins).then((item) => {
		if (item.length) {
			item.forEach((aaa) => {
				try {
					if (aaa.status === 'fulfilled') {
						const { module, name } = aaa.value;
						plugins[name] = {
							module: module.default,
							name
						};
					}
				} catch (err) {
					2;
					throw err;
				}
			});
		}
		1;
	});
}

async function downloadMangas({ manga, chapter, pages }) {
	let counter = 1;
	await rm(path.resolve('downloads', manga, chapter), {
		recursive: true
	}).catch(() => {});
	await mkdir(path.resolve('downloads', manga, chapter), { recursive: true });
	const promises = [];
	for (const page of pages) {
		const a = path.resolve('downloads', manga, chapter, `${counter}.png`);
		promises.push(downloadImage({ path: a, url: page }));
		if (promises.length >= 5) {
			await Promise.allSettled(promises);
			promises.length = 0;
		}
		counter++;
	}
	await Promise.allSettled(promises);
}

async function listMangas({ pluginId }) {
	const id = Object.keys(plugins).find(
		(item) => item.toLowerCase() === pluginId.toLowerCase()
	);
	if (id === undefined) {
		throw new Error(`Plugin with id ${pluginId} not found`);
	}
	const { module } = plugins[id];
	const instance = new module();
	let mangas = await instance.getMangas();
	if (mangas.length === 0) {
		mangas = await instance.updateMangas();
	}

	return mangas.map((manga) => ({ id: manga.id, title: manga.title }));
}

async function listChapters({ pluginId, mangaId }) {
	const id = Object.keys(plugins).find(
		(item) => item.toLowerCase() === pluginId.toLowerCase()
	);
	if (id === undefined) {
		throw new Error(`Plugin with id ${pluginId} not found`);
	}
	const { module } = plugins[id];
	const instance = new module();
	return instance._getChapters({ id: mangaId });
}

async function listPages({ pluginId, chapterId }) {
	const id = Object.keys(plugins).find(
		(item) => item.toLowerCase() === pluginId.toLowerCase()
	);
	if (id === undefined) {
		throw new Error(`Plugin with id ${pluginId} not found`);
	}
	const { module } = plugins[id];
	const instance = new module();
	return instance._getPages({ id: chapterId });
}

const MangasService = {
	initMangas,
	downloadMangas,
	listMangas,
	listChapters,
	listPages
};

export default MangasService;

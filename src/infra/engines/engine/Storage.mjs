import EbookGenerator from './EbookGenerator.mjs';
import Chapter from './Chapter.mjs';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import os from 'os';
import JSZip from 'jszip';

const extensions = {
	// chapter format
	img: 'img',
	cbz: '.cbz',
	pdf: '.pdf',
	epub: '.epub',
	// episode format
	m3u8: '.m3u8',
	mkv: '.mkv',
	mp4: '.mp4'
};

const statusDefinitions = {
	offline: 'offline' // chapter/manga that cannot be downloaded, but exist in manga directory
};

export default class Storage {
	// TODO: use dependency injection instead of globals for EbookGenerator
	constructor() {
		this.platform = process.platform;
		// TODO: Use fs-extra which provides more convenience functions (e.g. delete recursive)
		this.config = path.join('appdata', 'shinigami.');
		this.temp = path.join(os.tmpdir(), 'shinigami');
		this._createDirectoryChain(path.join('appdata'));
		this._createDirectoryChain(this.temp);

		this.pdfTargetHeight = 1600;
		this.fileURISubstitutions = {
			rgx: /['#?;]/g,
			map: {
				"'": '%27',
				'#': '%23',
				'?': '%3F',
				';': '%3B'
			}
		};
	}

	/**
	 * Save the given value for the given key in the persistant storage
	 */
	async saveConfig(key, value, indentation) {
		console.log('saveConfig', key);

		return new Promise((resolve, reject) => {
			fs.writeFile(
				this.config + key,
				JSON.stringify(value, undefined, indentation),
				function (error) {
					if (error) {
						reject(error);
					} else {
						resolve();
					}
				}
			);
		});
	}

	/**
	 * Load the value for the given key from the persistant storage
	 */
	async loadConfig(key) {
		//return fetch( this.config + key ).then( response => response.json() );
		return new Promise((resolve, reject) => {
			fs.readFile(this.config + key, 'utf8', (error, data) => {
				try {
					if (error) {
						throw error;
					}
					resolve(JSON.parse(data));
				} catch (e) {
					reject(e);
				}
			});
		});
	}

	/**
	 * Convenience function wrapping key value saving for mangas collection
	 */
	async saveMangaList(connectorID, mangas) {
		return this.saveConfig('mangas.' + connectorID, mangas);
	}

	/**
	 * Convenience function wrapping key value loading for mangas collection
	 */
	loadMangaList(connectorID) {
		return this.loadConfig('mangas.' + connectorID);
	}

	/**
	 * Return a promise that will be fulfilled if the corresponding path is an existing directory.
	 */
	async directoryExist(path) {
		return new Promise((resolve, reject) => {
			fs.stat(path, (error, stats) => {
				try {
					if (error) {
						throw error;
					}
					if (!stats.isDirectory()) {
						throw new Error(`The given path "${path}" is not a directory!`);
					}
					resolve();
				} catch (error) {
					reject(error);
				}
			});
		});
	}

	/**
	 * Return a promise that will be fulfilled if the corresponding manga directory exist.
	 * Due to performance this method must not be used for bulk existing checks.
	 */
	mangaDirectoryExist(manga) {
		return this.directoryExist(this._mangaOutputPath(manga));
	}

	/**
	 * Wrapper for fs.readdir that fill return a promise instead of using a callback
	 */
	_readDirectoryEntries(directory) {
		return new Promise((resolve, reject) => {
			fs.readdir(directory, (error, entries) => {
				if (error) {
					reject(error);
				} else {
					resolve(entries);
				}
			});
		});
	}

	/**
	 * Find all directories/files in the base directory.
	 * This key-value map can than be used to look up for existing manga titles (where the key represents the title and the value is always true).
	 * Keep in mind that the manga titles in this map are sanitized and may not equal the raw (original) manga title.
	 */
	getExistingMangaTitles(connector) {
		let directory = this._connectorOutputPath(connector);
		return this._readDirectoryEntries(directory).then((entries) => {
			let titleMap = [];
			// use key value pairs instead of plain titles to increase performance when looking up a certain manga title
			entries.forEach((entry) => {
				titleMap[entry] = true;
			});
			return Promise.resolve(titleMap);
		});
	}

	/**
	 * Find all directories/files in the manga directory.
	 * This list can than be used to look for existing chapter titles.
	 * Keep in mind that the chapter titles in this list are sanitized and may not equal the raw (original) chapter title.
	 */
	getExistingChapterTitles(manga) {
		let directory = this._mangaOutputPath(manga);
		return this._readDirectoryEntries(directory).then((entries) => {
			/*
			 * TODO: only add supported files / folders
			 * file that ends with any of the supported extension,
			 * folders that not ends with m3u8
			 * folders that contains m3u8?
			 * folders that contains any image?
			 */
			/*
			 * entries = entries.filter( path => {
			 * return (
			 * path.endsWith( extensions.m3u8 ) ||
			 * path.endsWith( extensions.mkv ) ||
			 * path.endsWith( extensions.mp4 ) ||
			 * path.endsWith( extensions.epub ) ||
			 * path.endsWith( extensions.cbz ) ||
			 * path.endsWith( extensions.pdf )
			 * // what about directory with images ???
			 * );
			 * } );
			 */
			let titleMap = [];
			// use key value pairs instead of plain titles to increase performance when looking up a certain manga title
			entries.forEach((entry) => {
				titleMap[entry] = true;
			});
			return Promise.resolve(titleMap);
		});
	}

	/**
	 * ...
	 * Callback will be executed after completion and provided with an array of errors (or an empty array when no errors occured)
	 * and a reference to the page list (undefined on error).
	 */
	loadChapterPages(chapter) {
		let path =
			chapter instanceof Chapter ? this._chapterOutputPath(chapter) : chapter;
		if (typeof path !== 'string') {
			return Promise.reject(
				new Error(
					'Invalid parameter "chapter", must be <String> or <Chapter> type!'
				)
			);
		}
		if (path.endsWith(extensions.m3u8)) {
			return this._loadEpisodeM3U8(path);
		}
		if (path.endsWith(extensions.mkv)) {
			return this._loadEpisodeMKV(path);
		}
		if (path.endsWith(extensions.mp4)) {
			return this._loadEpisodeMP4(path);
		}
		if (path.endsWith(extensions.epub)) {
			return this._loadChapterPagesEPUB(path);
		}
		if (path.endsWith(extensions.pdf)) {
			return this._loadChapterPagesPDF(path);
		}
		if (path.endsWith(extensions.cbz)) {
			return this._loadChapterPagesCBZ(path);
		}
		return this._loadChapterPagesFolder(path);
	}

	/**
	 *
	 */
	_loadEpisodeM3U8(directory) {
		return new Promise((resolve, reject) => {
			fs.readdir(directory, (error, files) => {
				if (error) {
					reject(error);
				} else {
					resolve(files);
				}
			});
		}).then((files) => {
			let playlist = files.find((file) => file.endsWith(extensions.m3u8));
			let subtitles = files.filter(
				(file) => file.endsWith('.ass') || file.endsWith('.ssa')
			);
			let media = {
				mirrors: [this._makeValidFileURL(directory, playlist)],
				subtitles: subtitles.sort().map((subtitle) => {
					let parts = subtitle.split('.');
					return {
						format: parts[parts.length - 1],
						locale: parts[parts.length - 2],
						url: this._makeValidFileURL(directory, subtitle),
						content: fs.readFileSync(path.join(directory, subtitle), {
							encoding: 'utf-8'
						})
					};
				})
			};
			return Promise.resolve(media);
		});
	}

	/**
	 *
	 */
	_loadEpisodeMKV(matroska) {
		// TODO: load subtitles
		let media = {
			video: this._makeValidFileURL(matroska, ''),
			subtitles: []
		};
		return Promise.resolve(media);
	}

	/**
	 *
	 */
	_loadEpisodeMP4(mpeg4) {
		// TODO: load subtitles
		let media = {
			video: this._makeValidFileURL(mpeg4, ''),
			subtitles: []
		};
		return Promise.resolve(media);
	}

	/**
	 * Return a promise with the loaded opened zip archive data
	 */
	_openZipArchive(file) {
		return new Promise((resolve, reject) => {
			fs.readFile(file, (error, data) => {
				if (error) {
					reject(error);
				} else {
					resolve(data);
				}
			});
		}).then((data) => {
			let zip = new JSZip();
			return zip.loadAsync(data, {});
		});
	}

	/**
	 * Extract file from zip entry to temp and returns a promise that
	 * will be resolved with the URI to the extracted file.
	 */
	_extractZipEntry(archive, file) {
		return archive.files[file].async('uint8array').then((data) => {
			let name = path.join(this.temp, path.basename(file));
			// attach timestamp to force reload of already existing, but overwritten temp files
			let page = encodeURI(
				'file://' + name.replace(/\\/g, '/') + '?ts=' + Date.now()
			);
			return new Promise((resolve, reject) => {
				fs.writeFile(name, data, (error) => {
					if (error) {
						reject(error);
					} else {
						resolve(page);
					}
				});
			});
		});
	}

	/**
	 * Read image data from e-book.
	 * Callback will be executed after completion and provided with an array of errors (or an empty array when no errors occured)
	 * and a reference to the page list (undefined on error).
	 */
	_loadChapterPagesEPUB(ebook) {
		return this._openZipArchive(ebook)
			.then((archive) => {
				let promises = Object.keys(archive.files)
					.filter((file) => {
						return /^OEBPS[/\\]img[/\\][^/\\]+$/.test(file);
					})
					.map((file) => {
						return this._extractZipEntry(archive, file);
					});
				return Promise.all(promises);
			})
			.then((pages) => {
				return Promise.resolve(pages.sort());
			});
	}

	/**
	 * Read image data from portable document format.
	 * Callback will be executed after completion and provided with an array of errors (or an empty array when no errors occured)
	 * and a reference to the page list (undefined on error).
	 */
	_loadChapterPagesPDF(/*pdf*/) {
		return Promise.reject(new Error('PDF preview not yet supported!'));
	}

	/**
	 * Read image data from CBZ archive.
	 * Callback will be executed after completion and provided with an array of errors (or an empty array when no errors occured)
	 * and a reference to the page list (undefined on error).
	 */
	_loadChapterPagesCBZ(cbz) {
		return this._openZipArchive(cbz)
			.then((archive) => {
				let promises = Object.keys(archive.files)
					.filter((file) => {
						return /^[^/\\]+$/.test(file);
					})
					.map((file) => {
						return this._extractZipEntry(archive, file);
					});
				return Promise.all(promises);
			})
			.then((pages) => {
				return Promise.resolve(pages.sort());
			});
	}

	/**
	 * Read image data from directory.
	 * Callback will be executed after completion and provided with an array of errors (or an empty array when no errors occured)
	 * and a reference to the page list (undefined on error).
	 */
	_loadChapterPagesFolder(directory) {
		return new Promise((resolve, reject) => {
			fs.readdir(directory, (error, files) => {
				if (error) {
					reject(error);
				} else {
					resolve(files);
				}
			});
		}).then((files) => {
			let pages = files.map((file) => this._makeValidFileURL(directory, file));
			return Promise.resolve(pages);
		});
	}

	/**
	 *
	 */
	_makeValidFileURL(directory, file) {
		return (
			encodeURI('file://' + path.join(directory, file).replace(/\\/g, '/'))
				// some special cases are not covered with encodeURI and needs to be replaced manually
				.replace(
					this.fileURISubstitutions.rgx,
					(m) => this.fileURISubstitutions.map[m]
				)
		);
	}

	/**
	 * Save the pages of the given chapter.
	 * The given content is a list of raw data for each corresponding page in the chapter.
	 * The storage decides depending on the engine and available settings where the pages will be stored!
	 * Callback will be executed after completion and provided with an array of errors (or an empty array when no errors occured).
	 *
	 * content is an array of blobs
	 */
	saveChapterPages(chapter, content) {
		try {
			let leadingZeroes = String(content.length).length;
			let pageData = content.map((page, index) => {
				return {
					name: this._pageFileName(index + 1, page.type, leadingZeroes),
					type: page.type,
					data: page
				};
			});

			let promise = undefined;
			let output = this._chapterOutputPath(chapter);
			if (Engine.Settings.chapterFormat.value === extensions.img) {
				this._createDirectoryChain(output);
				promise = this._saveChapterPagesFolder(output, pageData).then(() =>
					this._runPostChapterDownloadCommand(chapter, output)
				);
			}
			if (Engine.Settings.chapterFormat.value === extensions.cbz) {
				this._createDirectoryChain(path.dirname(output));
				promise = this._saveChapterPagesCBZ(
					output,
					pageData,
					chapter.manga.title,
					chapter.title
				).then(() => this._runPostChapterDownloadCommand(chapter, output));
			}
			if (Engine.Settings.chapterFormat.value === extensions.pdf) {
				this._createDirectoryChain(path.dirname(output));
				promise = this._saveChapterPagesPDF(output, pageData).then(() =>
					this._runPostChapterDownloadCommand(chapter, output)
				);
			}
			if (Engine.Settings.chapterFormat.value === extensions.epub) {
				this._createDirectoryChain(path.dirname(output));
				promise = this._saveChapterPagesEPUB(output, pageData).then(() =>
					this._runPostChapterDownloadCommand(chapter, output)
				);
			}
			return (
				promise ||
				Promise.reject(
					new Error(
						'Unsupported output format: ' + Engine.Settings.chapterFormat.value
					)
				)
			);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	/**
	 * Create and save pages to the given e-book file.
	 * Callback will be executed after completion and provided with an array of errors (or an empty array when no errors occured).
	 */
	_saveChapterPagesEPUB(ebook, pageData) {
		let zip = new JSZip();
		zip.file('mimetype', EbookGenerator.createMimetype());
		zip
			.folder('META-INF')
			.file('container.xml', EbookGenerator.createContainerXML());
		let oebps = zip.folder('OEBPS');
		oebps.folder('css').file('style.css', EbookGenerator.createStyleCSS());
		let img = oebps.folder('img');
		let xhtml = oebps.folder('xhtml');
		let params = [];
		pageData.forEach((page, index) => {
			img.file(page.name, page.data);
			xhtml.file(index + '.xhtml', EbookGenerator.createPageXHTML(page.name));
			params.push({
				img: page.name,
				xhtml: index + '.xhtml',
				mime: page.type
			});
		});
		let uid = btoa(encodeURIComponent(ebook)).replace(/[^a-zA-Z]/g, '');
		let title = `${path.basename(path.dirname(ebook))} ${
			path.sep
		} ${path.basename(ebook, extensions.epub)}`;
		oebps.file(
			'content.opf',
			EbookGenerator.createContentOPF(uid, title, params)
		);
		oebps.file('toc.ncx', EbookGenerator.createTocNCX(uid, '', params));
		return zip
			.generateAsync({ compression: 'STORE', type: 'uint8array' })
			.then((data) => {
				return this._writeFile(ebook, data);
			});
	}

	/**
	 * Create and save pages to the given portable document file.
	 * Callback will be executed after completion and provided with an array of errors (or an empty array when no errors occured).
	 */
	async _saveChapterPagesPDF(pdf, pageData) {
		var doc = new PDFDocument({ autoFirstPage: false });
		doc.pipe(fs.createWriteStream(pdf));
		for (let page of pageData) {
			await this._addImageToPDF(doc, page);
		}
		doc.end();
	}

	/**
	 * Add a single image as PDF page to the given document.
	 */
	async _addImageToPDF(pdfDocument, page) {
		let bitmap = await new Promise((resolve, reject) => {
			let img = new Image();
			img.onload = () => resolve(img);
			img.onerror = () => reject(new Error('Failed to load image!'));
			img.src = URL.createObjectURL(page.data);
		});
		let pdfImgType = this._pdfImageType(page);
		let blob;
		if (!pdfImgType) {
			pdfImgType = 'JPEG';
			let canvas = document.createElement('canvas');
			canvas.width = bitmap.width;
			canvas.height = bitmap.height;
			let ctx = canvas.getContext('2d');
			ctx.drawImage(bitmap, 0, 0);
			blob = await new Promise((resolve) => {
				canvas.toBlob((data) => resolve(data), 'image/jpeg', 0.9);
			});
		} else {
			blob = page.data;
		}

		let bytes = await this._blobToBytes(blob);
		let pdfTargetWidth = (this.pdfTargetHeight * bitmap.width) / bitmap.height;
		pdfDocument.addPage({ size: [pdfTargetWidth, this.pdfTargetHeight] });
		pdfDocument.image(bytes.buffer, 0, 0, {
			width: pdfTargetWidth,
			height: this.pdfTargetHeight
		});
	}

	/**
	 * Create and save pages to the given archive file.
	 * Callback will be executed after completion and provided with an array of errors (or an empty array when no errors occured).
	 */
	_saveChapterPagesCBZ(archive, pageData, mangaName = '', chapterName = '') {
		let zip = new JSZip();

		let comicFile = Engine.ComicInfoGenerator.createComicInfoXML(
			mangaName,
			chapterName,
			pageData.length
		);
		zip.file('ComicInfo.xml', comicFile);

		pageData.forEach((page) => {
			zip.file(page.name, page.data);
		});
		return zip
			.generateAsync({ compression: 'STORE', type: 'uint8array' })
			.then((data) => {
				return this._writeFile(archive, data);
			});
	}

	/**
	 * Save pages to the given directory.
	 * Callback will be executed after completion and provided with an array of errors (or an empty array when no errors occured).
	 */
	_saveChapterPagesFolder(directory, pageData) {
		let promises = pageData.map((page) => {
			return this._blobToBytes(page.data).then((data) => {
				return this._writeFile(path.join(directory, page.name), data);
			});
		});
		return Promise.all(promises);
	}

	/**
	 *
	 */
	_runPostChapterDownloadCommand(chapter, path) {
		let command = Engine.Settings.postChapterDownloadCommand.value; // `echo "%C% | %M% | %O%" > "%PATH%.txt"`;
		if (command) {
			command = command.replace(/%PATH%/g, path);
			command = command.replace(/%C%/g, chapter.manga.connector.label);
			command = command.replace(/%M%/g, chapter.manga.title);
			command = command.replace(/%O%/g, chapter.title);
			exec(command, { cwd: path.dirname(path), windowsHide: true }, (error) => {
				if (error) {
					console.error(error);
				}
			});
		}
		return Promise.resolve();
	}

	/**
	 * Helper function to convert a Blob to an Uint8Array
	 * https://github.com/electron/electron/blob/master/docs/api/protocol.md#protocolregisterbufferprotocolscheme-handler-completion
	 */
	_blobToBytes(blob) {
		return new Promise((resolve, reject) => {
			let reader = new FileReader();
			reader.onload = (event) => {
				// NOTE: Uint8Array() seems slightly better than Buffer.from(), but both are blazing fast
				resolve(new Uint8Array(event.target.result));
				//resolve( Buffer.from( event.target.result ) );
			};
			reader.onerror = (event) => {
				reject(event.target.error);
			};
			reader.readAsArrayBuffer(blob);
		});
	}

	/**
	 * Wrap the async write file function into a promise
	 */
	_writeFile(path, data) {
		console.log('_writeFile', path);

		return new Promise((resolve, reject) => {
			fs.writeFile(path, data, (error) => {
				if (error) {
					reject(error);
				} else {
					resolve(path);
				}
			});
		});
	}

	async saveTempFile(name, data) {
		try {
			let file = path.join(this.temp, this.sanatizePath(name));
			return this._writeFile(file, data);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	async saveVideoChunkTemp(content) {
		return this.saveTempFile(content.name, content.data);
	}

	/**
	 *
	 */
	concatVideoChunks(chapter, files, index, fileOut) {
		return new Promise((resolve, reject) => {
			index = index || 0;
			if (index >= files.length) {
				return resolve();
			}
			if (!fileOut) {
				let directory = this._mangaOutputPath(chapter.manga);
				this._createDirectoryChain(directory);
				let file = path.join(
					directory,
					this.sanatizePath(chapter.title + extensions.mp4)
				);
				fileOut = fs.openSync(file, 'w');
			}
			let data = fs.readFileSync(files[index]);
			fs.appendFileSync(fileOut, data);
			fs.unlinkSync(files[index]);
			this.concatVideoChunks(chapter, files, index + 1, fileOut)
				.then(() => resolve())
				.catch((error) => reject(error));
		});
	}

	/**
	 * Store a file directly in the chapter directory
	 */
	saveChapterFileM3U8(chapter, content) {
		try {
			let file = this._mangaOutputPath(chapter.manga);
			file = path.join(
				file,
				this.sanatizePath(chapter.title + extensions.m3u8)
			);
			this._createDirectoryChain(file);
			file = path.join(file, this.sanatizePath(content.name));
			return this._writeFile(file, content.data);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	/**
	 * Multiplex chapter playlist/streams using the given ffmpeg command (without output format & file!).
	 * The chapter directory is the working directory, and will be deleted after muxing.
	 * The output file will be stored directly in the manga directory.
	 */
	muxPlaylistM3U8(chapter, ffmpeg) {
		return new Promise((resolve, reject) => {
			let directory = this._mangaOutputPath(chapter.manga);
			this._createDirectoryChain(directory);
			let file = path.join(
				directory,
				this.sanatizePath(chapter.title + extensions.mkv)
			);
			directory = path.join(
				directory,
				this.sanatizePath(chapter.title + extensions.m3u8)
			);
			ffmpeg += ` -f matroska -y "${file}"`;
			exec(ffmpeg, { cwd: directory, windowsHide: true }, (error) => {
				if (error) {
					reject(error);
				} else {
					resolve();
				}
			});
		});
	}

	/**
	 * Helper function to generate the path where the bookmarks and markers are stored.
	 */
	get _bookmarkOutputPath() {
		return path.join(Engine.Settings.bookmarkDirectory.value, 'hakuneko.');
	}

	/**
	 * Helper function to generate the path where the connector mangas are stored.
	 */
	_connectorOutputPath(connector) {
		let output = Engine.Settings.baseDirectory.value;
		// NOTE: Some (system) connectors are defining their own directory
		if (connector.config && connector.config.path) {
			output = connector.config.path.value;
		} else {
			if (Engine.Settings.useSubdirectory.value) {
				output = path.join(output, this.sanatizePath(connector.label));
			}
		}
		return output;
	}

	/**
	 * Helper function to generate the path where the manga chapters are stored.
	 */
	_mangaOutputPath(manga) {
		let output = this._connectorOutputPath(manga.connector);
		output = path.join(output, this.sanatizePath(manga.title));
		return output;
	}

	/**
	 * Helper function to generate the path where the chapter pages are stored.
	 */
	_chapterOutputPath(chapter) {
		let output = this._mangaOutputPath(chapter.manga);
		output = path.join(output, this.sanatizePath(chapter.title));
		if (chapter.status === statusDefinitions.offline) {
			return output;
		}
		// only valid for loading anime episodes, ignored when save pages
		if (fs.existsSync(output + extensions.m3u8)) {
			return output + extensions.m3u8;
		}
		// only valid for loading anime episodes, ignored when save pages
		if (fs.existsSync(output + extensions.mkv)) {
			return output + extensions.mkv;
		}
		// only valid for loading anime episodes, ignored when save pages
		if (fs.existsSync(output + extensions.mp4)) {
			return output + extensions.mp4;
		}
		// used when loading and saving manga chapters
		if (Engine.Settings.chapterFormat.value !== extensions.img) {
			output += Engine.Settings.chapterFormat.value;
		}
		return output;
	}

	/**
	 * Helper function to recursively create all non-existing folders of the given path.
	 */
	_createDirectoryChain(p) {
		console.log('_createDirectoryChain', p);
		if (fs.existsSync(p) || p === path.parse(p).root) {
			return;
		}
		this._createDirectoryChain(path.dirname(p));
		fs.mkdirSync(p, '0755', true);
	}

	/**
	 * Create a path without forbidden characters.
	 * Based on HakuNeko legacy for backward compatibility to detect existing mangas/chapters.
	 * LINUX: wxT("/\r\n\t");
	 * WINDOWS: wxT("\\/:*?\"<>|\r\n\t");
	 */
	sanatizePath(path) {
		if (this.platform.indexOf('win') === 0) {
			// TODO: max. 260 characters per path
			path = path.replace(/[\\/:*?"<>|\r\n\t]/g, '');
		}
		if (this.platform.indexOf('linux') === 0) {
			path = path.replace(/[/\r\n\t]/g, '');
		}
		if (this.platform.indexOf('darwin') === 0) {
			// TODO: max. 32 chars per part
			path = path.replace(/[/:\r\n\t]/g, '');
		}
		return path.replace(/[.\s]+$/g, '').trim();
	}

	/**
	 * Helper function to generate an entry name for a page (picture) depending on the given number and mime type
	 */
	_pageFileName(number, mimeType, leadingZeroes) {
		let fileName = String(number).padStart(leadingZeroes, 0);
		if (mimeType.indexOf('image/webp') > -1) {
			return fileName + '.webp';
		}
		if (mimeType.indexOf('image/jpeg') > -1) {
			return fileName + '.jpg';
		}
		if (mimeType.indexOf('image/png') > -1) {
			return fileName + '.png';
		}
		if (mimeType.indexOf('image/gif') > -1) {
			return fileName + '.gif';
		}
		if (mimeType.indexOf('image/bmp') > -1) {
			return fileName + '.bmp';
		}
		if (mimeType.indexOf('image/') > -1) {
			return fileName + '.img';
		}
		return fileName + '.bin';
	}

	/**
	 * Helper function to get the mime type depending on the file extension of the given file name.
	 */
	_pageFileMime(file) {
		let extension = path.extname(file);
		if (extension === '.webp') {
			return 'image/webp';
		}
		if (extension === '.jpeg') {
			return 'image/jpeg';
		}
		if (extension === '.jpg') {
			return 'image/jpeg';
		}
		if (extension === '.png') {
			return 'image/png';
		}
		if (extension === '.gif') {
			return 'image/gif';
		}
		if (extension === '.bmp') {
			return 'image/bmp';
		}
		if (extension === '.img') {
			return 'image/';
		}
		return 'application/octet-stream';
	}

	/**
	 * Helper function to get the image type for jsPDF of the given mime type.
	 * If the mime is not a spported PDF image format undefined will be returned.
	 */
	_pdfImageType(image) {
		if (image.type === 'image/jpeg') {
			return 'JPEG';
		}
		if (image.type === 'image/png') {
			return 'PNG';
		}
		return undefined;
	}

	/**
	 * Save the given value for the given key in the bookmark storage
	 */
	saveBookmarks(key, value, indentation) {
		return new Promise((resolve, reject) => {
			fs.writeFile(
				this._bookmarkOutputPath + key,
				JSON.stringify(value, undefined, indentation),
				function (error) {
					if (error) {
						reject(error);
					} else {
						resolve();
					}
				}
			);
		});
	}

	/**
	 * Load the value for the given key from the bookmark storage
	 */
	async loadBookmarks(key) {
		return new Promise((resolve, reject) => {
			fs.readFile(this._bookmarkOutputPath + key, 'utf8', (error, data) => {
				try {
					if (error) {
						throw error;
					}
					resolve(JSON.parse(data));
				} catch (e) {
					reject(e);
				}
			});
		});
	}
}

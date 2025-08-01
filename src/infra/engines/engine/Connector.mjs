import Manga from './Manga.mjs';
import { JSDOM } from 'jsdom';
/**
 * Base class for connector plugins
 */
export default class Connector {
	// TODO: use dependency injection instead of globals for Engine.Storage, Engine.Request
	constructor() {
		this.id = Symbol();
		this.label = '';
		this.tags = [];
		/*
		 * READONLY: lock state may used to prevent to many concurrent requests per second
		 * do not set directly, use lock() and unlock()
		 */
		this.isLocked = false;
		this.initialized = false;
		//
		this.isUpdating = false;
		//
		this.mangaCache = undefined;
		//
		this.existingMangas = [];
		/*
		 * initialize the default request options
		 * these request options will also be used for download jobs (image/media stream downloads)
		 * https://developer.mozilla.org/en-US/docs/Web/API/Request/Request 'init' parameter
		 */
		this.requestOptions = {
			method: 'GET',
			mode: 'cors',
			redirect: 'follow',
			// include credentials to apply cookies from browser window
			credentials: 'same-origin', // 'include',
			headers: new Headers()
		};
		this.requestOptions.headers.set(
			'accept',
			'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9'
		);
	}

	canHandleURI(uri) {
		return this.url === uri.origin;
	}

	/**
	 *
	 */
	get icon() {
		return '/img/connectors/' + this.id;
	}

	/**
	 * See: this._initialize()
	 * This method can be overwritten by the connector for a specific implementation of the initialization process
	 */
	async _initializeConnector() {
		let uri = new URL(this.url);
		let request = new Request(uri.href, this.requestOptions);
		return Engine.Request.fetchUI(request, '', 60000, true); // 60sec is default timeout from fetchUI, and we need images=true for DDOS-GUARD
	}

	async initialize() {
		try {
			if (!this.initialized) {
				await this._initializeConnector();
				this.initialized = true;
			}
		} catch (error) {
			// only throw when not in offline mode
			if (!error.stack.startsWith('ERR_INTERNET_DISCONNECTED')) {
				throw error;
			}
		}
	}

	/**
	 * Find first manga with title that matches the given pattern (case-insensitive).
	 */
	findMatchingManga(pattern) {
		let needle = pattern.toLowerCase();
		return Engine.Storage.loadMangaList(this.id)
			.then((mangas) => {
				return Promise.resolve(
					mangas.find((manga) => manga.title.toLowerCase().includes(needle))
				);
			})
			.catch(() => Promise.resolve(undefined));
	}

	/**
	 * Update the manga list in the local storage.
	 * Callback will be executed after completion and provided with a reference to the manga list (undefined on error).
	 */
	async updateMangas(callback) {
		if (this.isUpdating) {
			return;
		}
		this.isUpdating = true;
		try {
			await this.initialize();
			let mangas = await this._getMangaList();
			// remove duplicates by checking if manga with given ID is first occurance in list
			const mangasNotDuplicated = {};
			for (const manga of mangas) {
				if (mangasNotDuplicated[manga.id] !== undefined) continue;
				mangasNotDuplicated[manga.id] = manga;
			}
			Object.keys(mangasNotDuplicated).map((id) => mangasNotDuplicated[id]);
			// mangas = mangas.filter((manga, index) => {
			// 	return index === mangas.findIndex((m) => m.id === manga.id);
			// });
			// sort by title
			mangas.sort((a, b) => {
				return a.title.toLowerCase() < b.title.toLowerCase() ? -1 : 1;
			});

			this.mangaCache = undefined;
			await Engine.Storage.saveMangaList(this.id, mangas);
			this.isUpdating = false;
			if (callback) {
				callback(null, mangas);
			}
			return this.getMangas();
		} catch (err) {
			this.isUpdating = false;
			if (callback) {
				callback(err, undefined);
			}
			return Promise.reject(err);
		}
	}

	/**
	 * Get all mangas for the connector.
	 * Callback will be executed after completion and provided with a reference to the manga list (undefined on error).
	 */
	async getMangas(callback) {
		// find all manga titles (sanitized) that are found in the base directory for this connector
		return Engine.Storage.getExistingMangaTitles(this)
			.catch((e) => {
				// Ignore manga file reading errors (e.g. root directory not exist)
				return Promise.resolve([]);
			})
			.then((existingMangaTitles) => {
				this.existingManga = existingMangaTitles;
				// check if manga list is cached
				return this.mangaCache && this.mangaCache.length
					? this._getUpdatedMangasFromCache()
					: this._getUpdatedMangasFromFile();
			})
			.then((mangas) => {
				if (callback) {
					callback(null, mangas);
				}
				return Promise.resolve(mangas);
			})
			.catch((error) => {
				// TODO: remove log ... ?
				console.warn('getMangas', error);
				if (callback) {
					callback(error, this.mangaCache);
				}
				return Promise.reject(error);
			});
	}

	/**
	 * See: getMangaFromURI(uri)
	 * This method can be overwritten by connector implementations.
	 */
	async _getMangaFromURI(uri) {
		let id = uri.pathname + uri.search;
		let title =
			'Manga #' +
			id
				.split('')
				.reduce((a, v) => a + (a % 31) + v.charCodeAt(), id.length)
				.toString(16)
				.toUpperCase();
		return new Manga(this, id, title);
	}

	/**
	 * Get the manga from the provided resource (URI).
	 * @param {URL} uri - ...
	 * @returns {Promise<Manga>} - ...
	 */
	async getMangaFromURI(uri) {
		/*
		 * TODO: try to find title in cached manga list first
		 *       => this.getMangas().then( ... )
		 */
		await this.initialize();
		return this._getMangaFromURI(uri);
	}

	/**
	 *
	 */
	_getUpdatedMangasFromCache() {
		if (this.mangaCache) {
			this.mangaCache.forEach((manga) => {
				manga.updateStatus();
			});
		}
		return Promise.resolve(this.mangaCache);
	}

	/**
	 *
	 */
	_getUpdatedMangasFromFile() {
		// get manga list from the local storage and cache them
		return Engine.Storage.loadMangaList(this.id)
			.then((mangas) => {
				// de-serialize mangas into objects
				this.mangaCache = mangas.map((manga) => {
					return new Manga(this, manga.id, manga.title);
				});
				return Promise.resolve(this.mangaCache);
			})
			.catch((error) => {
				// TODO: remove log ... ?
				console.warn('_getUpdatedMangasFromFile', error);
				return Promise.resolve(this.mangaCache || []);
			});
	}

	/**
	 * Return a promise that will be resolved after the given amount of time in milliseconds
	 */
	wait(time) {
		return new Promise((resolve) => {
			setTimeout(resolve, time);
		});
	}

	/**
	 * Switch the connector to lock mode.
	 * In lock mode the connector may limit concurrent access.
	 * The limitation depends on the connector implementation.
	 * Returns a key required to unlock the connector (only the owner with the key can unlock the connector)
	 * or null if the connector is already locked by a different owner.
	 */
	lock() {
		if (this.isLocked) {
			return null;
		}
		this.isLocked = Symbol();
		return this.isLocked;
	}

	/**
	 *
	 */
	unlock(key) {
		if (this.isLocked === key) {
			this.isLocked = false;
		}
	}

	adLinkDecrypt(element) {
		let uri = new URL(element.href);
		if (uri.hostname === 'nofil.net' && element.pathname.includes('safeme')) {
			element.href = uri.searchParams.get('url');
		}
	}

	/**
	 * Helper function to decrypt the protected email within the given DOM element.
	 */
	cfMailDecrypt(element) {
		[...element.querySelectorAll('span[data-cfemail]')].forEach((span) => {
			let encrypted = span.getAttribute('data-cfemail'); // span.dataset.cfmail
			if (encrypted) {
				// decrypt mail
				let decrypted = '';
				let key = ('0x' + encrypted.substr(0, 2)) | 0;
				for (let i = 2; i < encrypted.length; i += 2) {
					decrypted +=
						'%' +
						('0' + (('0x' + encrypted.substr(i, 2)) ^ key).toString(16)).slice(
							-2
						);
				}
				span.replaceWith(decodeURIComponent(decrypted));
			}
		});
	}
	// TODO: The decryption is outdated and no longer works...
	/*
	 * deobfuscateMail($, element) {
	 * let parent = element.parent();
	 *
	 * // Step 1: decode plain mail text
	 * parent.find('[data-cfemail]').each((index, node) => {
	 * node = $(node);
	 * node.html(this._decryptMail(node.data('cfemail')));
	 * });
	 *
	 * // Step 2: decode mail links
	 * parent.find('a[href]').each((index, node) => {
	 * node = $(node);
	 * let match = node.attr('href').match(/^\/cdn-cgi.*?email-protection#?(.*?)$/);
	 * if(match) {
	 * node.attr('href', match[1] ? 'mailto:' + this._decryptMail(match[1]) : null);
	 * }
	 * });
	 * }
	 *
	 * _decryptMail(encrypted) {
	 * encrypted = typeof encrypted === 'string' ? encrypted : encrypted.toString();
	 * let decrypted = encrypted;
	 * if(encrypted) {
	 * decrypted = '';
	 * let key = parseInt(encrypted.substr(0, 2), 16);
	 * for (let i = 2; i < encrypted.length; i += 2) {
	 * decrypted += String.fromCharCode(parseInt(encrypted.substr(i, 2), 16) ^ key);
	 * }
	 * }
	 * return decrypted;
	 * }
	 */

	/**
	 * [OBSOLETE => use getRootRelativeLink( element, base )]
	 * Revert the expansion of relative links regarding the base url,
	 * or leave the absolute url if the link seems not to been expanded.
	 */
	getRelativeLink(element) {
		if (element.href || element.src) {
			let baseURI = new URL(this.url);
			let refURI = new URL(element.href || element.src);

			// case: element.href => protocol + host expanded to window location (e.g. /sub/page.html => protocol://window/sub/page.html)
			if (refURI.origin === window.location.origin) {
				refURI.hostname = baseURI.hostname;
			}

			/*
			 * case: element.href => protocol expanded to window location (e.g. //domain.net/sub/page.html => protocol://domain.net/sub/page.html)
			 * HakuNeko uses its own protocol for local hosted application files
			 * expansion of hrefs may lead to wrong protocol for external links
			 * => use the protocol of the connector's base url
			 */
			if (refURI.protocol === window.location.protocol) {
				refURI.protocol = baseURI.protocol;
			}

			// case: element.href => absolute link that contains base url of connector (e.g. http://connector.net/sub/page.html)
			if (refURI.hostname === baseURI.hostname) {
				return refURI.pathname + refURI.search + refURI.hash;
			} else {
				return refURI.href;
			}
		}
	}

	/**
	 *
	 */
	getAbsolutePath(reference, base) {
		let baseURI;
		switch (true) {
			case base instanceof URL:
				baseURI = base;
				break;
			case typeof base === 'string':
				baseURI = new URL(base);
				break;
			default:
				throw new Error(
					'Failed to extract relative link (parameter "base" is invalid)!'
				);
		}

		let refURI;
		switch (true) {
			case reference instanceof URL:
				refURI = reference;
				break;
			case typeof reference === 'string':
				refURI = new URL(reference, baseURI.href);
				break;
			case reference['src'] !== undefined:
				refURI = new URL(reference.getAttribute('src'), baseURI.href);
				break;
			case reference['href'] !== undefined:
				refURI = new URL(reference.getAttribute('href'), baseURI.href);
				break;
			default:
				throw new Error(
					'Failed to extract relative link (parameter "reference" is invalid)!'
				);
		}

		return refURI.href;
	}

	/**
	 *
	 */
	getRootRelativeOrAbsoluteLink(reference, base) {
		let uri = new URL(this.getAbsolutePath(reference, base));
		if (uri.hostname === new URL(base).hostname) {
			// same domain => return only path
			return uri.pathname + uri.search + uri.hash;
		} else {
			// cross domain => return absolute link
			return uri.href;
		}
	}

	/**
	 * Create DOM (HTML element) from the given content.
	 * Image tags can be replaced with source tags to prevent the 'src' attribute from loading its content (save bandwith, improve performance).
	 * Atributes from iframe tags (espacially 'src') can be removed to prevent it from loading its content (save bandwith, improve performance).
	 * NOTE: When loading content into DOM, all links without a full qualified domain name will be expanded using the hostname of this app
	 *       => do not forget to remove this prefix from the links!
	 */
	createDOM(content, replaceImageTags, clearIframettributes) {
		replaceImageTags = replaceImageTags !== undefined ? replaceImageTags : true;
		clearIframettributes =
			clearIframettributes !== undefined ? clearIframettributes : true;
		if (replaceImageTags) {
			content = content.replace(/<img/g, '<source');
			content = content.replace(/<\/img/g, '</source');
			content = content.replace(/<use/g, '<source');
			content = content.replace(/<\/use/g, '</source');
		}
		if (clearIframettributes) {
			content = content.replace(/<iframe[^<]*?>/g, '<iframe>');
		}
		let dom = document.createElement('html');
		dom.innerHTML = content;
		return dom;
	}

	fetchJSON(request, retries) {
		retries = retries || 0;
		if (typeof request === 'string') {
			request = new Request(request, this.requestOptions);
		}
		// TODO: check if this will affect (replace) the input parameter?
		if (request instanceof URL) {
			request = new Request(request.href, this.requestOptions);
		}
		return fetch(request).then((response) => {
			if (response.status >= 500 && retries > 0) {
				return this.wait(5000).then(() => this.fetchJSON(request, retries - 1));
			}
			if (response.status === 200) {
				return response.json();
			}
			throw new Error(
				`Failed to receive content from "${request.url}" (status: ${response.status}) - ${response.statusText}`
			);
		});
	}

	async fetchDOM(request, selector, retries, encoding) {
		return this.fetchDOMMethod({
			request,
			encoding,
			retries,
			selector,
			method: 'GET'
		});
	}

	async fetchDOMMethod({
		request,
		method = 'GET',
		selector,
		retries,
		encoding
	}) {
		retries = retries || 0;
		if (typeof request === 'string') {
			request = new Request(request, this.requestOptions);
		}
		// TODO: check if this will affect (replace) the input parameter?
		if (request instanceof URL) {
			request = new Request(request.href, this.requestOptions);
		}
		const response = await fetch(request.clone(), { method: method }).catch(
			(e) => {
				if (retries === 0) throw e;
				return { status: 500 };
			}
		);
		if (response.status >= 500 && retries > 0) {
			await this.wait(2500);
			return this.fetchDOMMethod({
				request,
				selector,
				retries: retries - 1,
				method
			});
		}
		const content = response.headers.get('content-type');
		if (response.status === 200 || content.includes('text/html')) {
			const data = await response.arrayBuffer();
			const dom = this.createDOM(
				new TextDecoder(encoding || 'utf8').decode(data)
			);
			const a = dom.outerHTML;
			return Promise.resolve(
				!selector ? dom : [...dom.querySelectorAll(selector)]
			);
		}
		throw new Error(
			`Failed to receive content from "${request.url}" (type: ${content}, status: ${response.status}) - ${response.statusText}`
		);
	}

	async fetchDOM2(request, selector, retries, encoding) {
		retries = retries || 0;
		if (typeof request === 'string') {
			request = new Request(request, this.requestOptions);
		}
		// TODO: check if this will affect (replace) the input parameter?
		if (request instanceof URL) {
			request = new Request(request.href, this.requestOptions);
		}
		const response = await fetch(request.clone());
		if (response.status >= 500 && retries > 0) {
			await this.wait(2500);
			return this.fetchDOM2(request, selector, retries - 1);
		}
		const content = response.headers.get('content-type');
		if (response.status === 200 || content.includes('text/html')) {
			const data = await response.arrayBuffer();
			const dom = this.createDOM(
				new TextDecoder(encoding || 'utf8').decode(data)
			);
			const p = await JSDOM.fromURL(request.url, {
				pretendToBeVisual: true,
				// runScripts: 'outside-only',
				runScripts: 'dangerously',
				resources: 'usable'
			});

			await new Promise((resolve, reject) => {
				p.window.document.addEventListener('DOMContentLoaded', () => {
					resolve();
				});
			});
			const aaaaa = await Promise.resolve([
				...p.window.document.querySelectorAll('html')
			]);

			const qqq1 = await Promise.resolve([
				...p.window.document.querySelectorAll(selector)
			]);
			// const d = new JSDOM(new TextDecoder(encoding || 'utf8').decode(data), {
			// 	url: request.url
			// });
			// const qqq = await Promise.resolve([
			// 	...d.window.document.querySelectorAll(selector)
			// ]);
			// const t = qqq.outerHTML;
			// // await setTimeout(10000);
			// const a = dom.outerHTML;
			// const padroa = await Promise.resolve(
			// 	!selector ? dom : [...dom.querySelectorAll(selector)]
			// );
			p.window.close();
			return qqq1;
		}
		throw new Error(
			`Failed to receive content from "${request.url}" (type: ${content}, status: ${response.status}) - ${response.statusText}`
		);
	}

	/**
	 * Get the content for the given Request
	 * and get all elements matching the given CSS selector.
	async fetchDOM(request, selector, retries, encoding) {
		console.log('fetching dom from ' + request.url);
		retries = retries || 0;
		if (typeof request === 'string') {
			request = new Request(request, this.requestOptions);
		}
		// TODO: check if this will affect (replace) the input parameter?
		if (request instanceof URL) {
			request = new Request(request.href, this.requestOptions);
		}
		const response = await fetch(request.clone());
		if (response.status >= 500 && retries > 0) {
			await this.wait(2500);
			return this.fetchDOM(request, selector, retries - 1);
		}
		const content = response.headers.get('content-type');
		if (response.status === 200 || content.includes('text/html')) {
			const data = await response.arrayBuffer();
			const dom = this.createDOM(
				new TextDecoder(encoding || 'utf8').decode(data)
			);
			return Promise.resolve(
				!selector ? dom : [...dom.querySelectorAll(selector)]
			);
		}
		throw new Error(
			`Failed to receive content from "${request.url}" (type: ${content}, status: ${response.status}) - ${response.statusText}`
		);
	}

	**
	 *
     
	fetchJSON(request, retries) {
		console.log('fetching json from ' + request.url);
		retries = retries || 0;
		if (typeof request === 'string') {
			request = new Request(request, this.requestOptions);
		}
		// TODO: check if this will affect (replace) the input parameter?
		if (request instanceof URL) {
			request = new Request(request.href, this.requestOptions);
		}
		return fetch(request).then((response) => {
			if (response.status >= 500 && retries > 0) {
				return this.wait(5000).then(() => this.fetchJSON(request, retries - 1));
			}
			if (response.status === 200) {
				return response.json();
			}
			throw new Error(
				`Failed to receive content from "${request.url}" (status: ${response.status}) - ${response.statusText}`
			);
		});
	}

	fetchGraphQL(request, operationName, query, variables) {
		if (typeof request === 'string') {
			request = new URL(request);

		console.log('fetching graphql from ' + request.href);

		const graphQLRequest = new Request(
			request.href ? request.href : request.url,
			{
				...this.requestOptions,
				method: 'POST',
				body: JSON.stringify({
					operationName,
					query,
					variables
				})
			}
		);
		graphQLRequest.headers.set('content-type', 'application/json');

		return this.fetchJSON(graphQLRequest).then((data) => {
			if (data.errors) {
				throw new Error(
					this.label +
						' errors: ' +
						data.errors.map((error) => error.message).join('\n')
				);
			}
			if (!data.data) {
				throw new Error(this.label + 'No data available!');
			}
			return data.data;
		});
	}

	async fetchRegex(request, regex) {
		if (!/\/[imsuy]*g[imsuy]*$/.test('' + regex)) {
			throw new Error(
				'The provided RegExp must contain the global "g" modifier!'
			);
		}
		let response = await fetch(request);
		let data = await response.text();
		let result = [];
		let match = undefined;
		// eslint-disable-next-line no-cond-assign
		while ((match = regex.exec(data))) {
			result.push(match[1]);
		}
		return result;
	}

	/**
	 *
	 */
	/*
	 * // https://developer.mozilla.org/en-US/docs/Web/API/XPathResult#Constants
	 * fetchXPATH( request, xpath, resultType, retries ) {
	 * return fetch( request )
	 * .then( response => response.text() )
	 * .then( data => {
	 * let dom = this.createDOM( data );
	 * let result = document.evaluate( xpath, dom, null, resultType, null);
	 * if( result.resultType > 3 ) {
	 * // transform iterator into array
	 * }
	 * return Promise.resolve( result );
	 * } )
	 * }
	 *
	 * let request = new Request( this.url + manga.id, this.requestOptions );
	 * this.fetchXPATH( request, '//div[@id="tomos"]/div[@id="tomo"]/a', XPathResult.ORDERED_NODE_ITERATOR_TYPE )
	 * .then( data => {
	 * console.log( data.iterateNext(); );
	 * callback( null, [] );
	 * } )
	 * .catch( error => {
	 * console.error( error, manga );
	 * callback( error, undefined );
	 * } );
	 */

	async fetchPROTO(request, protoTypes, rootType) {
		let Root = (await protobuf.load(protoTypes)).lookupType(rootType);
		let response = await fetch(request);
		let data = await response.arrayBuffer();
		data = Root.decode(new Uint8Array(data));
		return Root.toObject(data);
	}

	/**
	 *
	 */
	createConnectorURI(payload) {
		let data = JSON.stringify(payload);
		let bytes = CryptoJS.enc.Utf8.parse(data);
		let encoded = CryptoJS.enc.Base64.stringify(bytes);
		let uri = new URL('connector://' + this.id);
		uri.searchParams.set('payload', encoded);
		return uri.href;
	}

	/**
	 * [DEPRECATED] Use _getMangas() instead
	 * Callback based method to get all mangas from a website.
	 * Older connector implementations are implementing/overriding this method.
	 * @param callback
	 */
	async _getMangaList(callback) {
		// default implementation => forward compatibility to new interface method
		try {
			// TODO: this.initialize()
			let mangas = await this._getMangas();
			if (callback) {
				callback(null, mangas);
			}
			return mangas;
		} catch (error) {
			console.error(error, this);
			if (callback) {
				callback(error, undefined);
			}
			return Promise.reject(error);
		}
	}

	/**
	 * [DEPRECATED] Use _getChapters() instead
	 * Callback based method to get all chapters from a website.
	 * Older connector implementations are implementing/overriding this method.
	 * @param manga
	 * @param callback
	 */
	async _getChapterList(manga, callback) {
		// default implementation => forward compatibility to new interface method
		try {
			// TODO: this.initialize()
			let chapters = await this._getChapters(manga);
			callback(null, chapters);
		} catch (error) {
			console.error(error, manga);
			callback(error, undefined);
		}
	}

	/**
	 * [DEPRECATED] Use _getPages() instead
	 * Callback based method to get all images from a website.
	 * Older connector implementations are implementing/overriding this method.
	 * @param manga
	 * @param chapter
	 * @param callback
	 */
	async _getPageList(manga, chapter, callback) {
		// default implementation => forward compatibility to new interface method
		try {
			// TODO: this.initialize()
			let pages = await this._getPages(chapter);
			callback(null, pages);
		} catch (error) {
			console.error(error, chapter);
			callback(error, undefined);
		}
	}

	/**
	 * Method to get all mangas from a website.
	 * New connector implementations must implementing/overriding this method.
	 * @returns {Manga[]} - A list of mangas
	 */
	async _getMangas() {
		throw new Error('Not implemented!');
	}

	/**
	 * Method to get all chapters from a website.
	 * New connector implementations must implementing/overriding this method.
	 * @param {Object} manga - The manga for which the chapters shall be fetched
	 * @param {string} manga.id - Unique identifier of the manga that implies the resource (URI) to get the chapters from
	 * @returns {Chapter[]} - A list of chapters
	 */
	// eslint-disable-next-line no-unused-vars
	async _getChapters(manga) {
		throw new Error('Not implemented!');
	}

	/**
	 * Method to get all pages from a website.
	 * New connector implementations must implementing/overriding this method.
	 * @param {Object} chapter - The chapter for which the media shall be fetched
	 * @param {string} chapter.id - Unique identifier of the chapter that implies the resource (URI) to get the media from
	 * @returns {Promise<(string[]|Object)>} - A list of image links (USVString) or a media type
	 */
	// eslint-disable-next-line no-unused-vars
	async _getPages(chapter) {
		throw new Error('Not implemented!');
	}

	/**
	 *
	 */
	handleConnectorURI(uri) {
		let encoded = uri.searchParams.get('payload');
		let bytes = CryptoJS.enc.Base64.parse(encoded);
		let data = bytes.toString(CryptoJS.enc.Utf8);
		let payload = JSON.parse(data);
		return this._handleConnectorURI(payload);
	}

	/**
	 * Return a promise that resolves with a mime typed buffer on succes,
	 * or a promise that rejects with an error.
	 */
	async _handleConnectorURI(payload) {
		/*
		 * TODO: only perform requests when from download manager
		 * or when from browser for preview and selected chapter matches
		 */
		let request = new Request(payload, this.requestOptions);
		let response = await fetch(request);
		let data = await response.blob();
		data = await this._blobToBuffer(data);
		this._applyRealMime(data);
		return data;
	}

	/**
	 * Protected helper function to convert a Blob to a MimeTypedBuffer
	 * https://github.com/electron/electron/blob/master/docs/api/protocol.md#protocolregisterbufferprotocolscheme-handler-completion
	 */
	async _blobToBuffer(blob) {
		return new Promise((resolve, reject) => {
			let reader = new FileReader();
			reader.onload = (event) => {
				resolve({
					mimeType: blob.type,
					// NOTE: Uint8Array() seems slightly better than Buffer.from(), but both are blazing fast
					data: Buffer.from(event.target.result) // new Uint8Array( event.target.result )
				});
			};
			reader.onerror = (event) => {
				reject(event.target.error);
			};
			reader.readAsArrayBuffer(blob);
		});
	}

	/**
	 * Apply the real mime type to the MimeTypedBuffer (based on file signature).
	 */
	_applyRealMime(data) {
		// WEBP [52 49 46 46 . . . . 57 45 42 50]
		if (
			data.mimeType !== 'image/webp' &&
			data.data[8] === 0x57 &&
			data.data[9] === 0x45 &&
			data.data[10] === 0x42 &&
			data.data[11] === 0x50
		) {
			console.warn(
				'Provided mime type "' +
					data.mimeType +
					'" does not match the file signature and was replaced by "image/webp"!'
			);
			data.mimeType = 'image/webp';
			return;
		}
		// JPEG [FF D8 FF]
		if (
			data.mimeType !== 'image/jpeg' &&
			data.data[0] === 0xff &&
			data.data[1] === 0xd8 &&
			data.data[2] === 0xff
		) {
			console.warn(
				'Provided mime type "' +
					data.mimeType +
					'" does not match the file signature and was replaced by "image/jpeg"!'
			);
			data.mimeType = 'image/jpeg';
			return;
		}
		// PNG [. 50 4E 47]
		if (
			data.mimeType !== 'image/png' &&
			data.data[1] === 0x50 &&
			data.data[2] === 0x4e &&
			data.data[3] === 0x47
		) {
			console.warn(
				'Provided mime type "' +
					data.mimeType +
					'" does not match the file signature and was replaced by "image/png"!'
			);
			data.mimeType = 'image/png';
			return;
		}
		// GIF [47 49 46]
		if (
			data.mimeType !== 'image/gif' &&
			data.data[0] === 0x47 &&
			data.data[1] === 0x49 &&
			data.data[2] === 0x46
		) {
			console.warn(
				'Provided mime type "' +
					data.mimeType +
					'" does not match the file signature and was replaced by "image/gif"!'
			);
			data.mimeType = 'image/gif';
			return;
		}
		// BMP [42 4D]
		if (
			data.mimeType !== 'image/bmp' &&
			data.data[0] === 0x42 &&
			data.data[1] === 0x4d
		) {
			console.warn(
				'Provided mime type "' +
					data.mimeType +
					'" does not match the file signature and was replaced by "image/bmp"!'
			);
			data.mimeType = 'image/bmp';
			return;
		}
	}

	getFormatRegex() {
		return {
			chapterRegex:
				/\s*(?:^|ch\.?|ep\.?|chapter|chapitre|Bölüm|Chap|Chương|ตอนที่|Kapitel|Capitolo|Rozdział|Глава|Cap[ií]tulo|cap|[ée]pisode|Page|N[゜°]|DAY|#)\s?:?\s*([\d.?\-?v?]+)(?:\s|:|$)+/i, // $ not working in character groups => [\s\:$]+ does not work
			volumeRegex: /\s*(?:vol\.?|volume|Sezon|Том|Band|Cilt|tome)\s*(\d+)/i
		};
	}
}

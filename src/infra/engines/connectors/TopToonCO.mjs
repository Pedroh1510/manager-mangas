import puppeteer, { Page, Locator, Browser } from 'puppeteer';
import Connector from '../engine/Connector.mjs';
import Manga from '../engine/Manga.mjs';
import { ServiceError } from '../../errors.js';

export default class TopToonCO extends Connector {
	constructor() {
		super();
		super.id = 'toptoonco';
		super.label = 'TOPTOON (탑툰)';
		this.tags = ['webtoon', 'korean'];
		this.url = 'https://toptoon.com.co';
		this.links = {
			login: 'https://toptoon.com.co/temp/login'
		};
	}
	/**
	 * @type {Page}
	 */
	page = null;
	timeout = 5000;
	/**
	 * @type {Browser}
	 */
	browser = null;

	login = null;
	password = null;

	async access() {
		if (!this.browser) {
			this.browser = await puppeteer.launch({
				headless: true,
				args: [
					'--no-sandbox',
					'--disable-setuid-sandbox',
					// '--disable-web-security',
					'--disable-features=IsolateOrigins,site-per-process'
					// '--disable-dev-shm-usage'
				]
			});
		}
		if (this.page) {
			await this.page.close();
			this.page = null;
		}
		const page = await this.browser.newPage();
		const timeout = 30000;
		page.setDefaultTimeout(timeout);
		{
			const targetPage = page;
			await targetPage.setViewport({
				width: 1232,
				height: 961
			});
		}
		{
			const targetPage = page;
			await targetPage.goto(this.links.login);
		}
		{
			const targetPage = page;
			await Locator.race([
				targetPage.locator('::-p-aria( Faça Login)'),
				targetPage.locator('#userDropdown'),
				targetPage.locator('::-p-xpath(//*[@id=\\"userDropdown\\"])'),
				targetPage.locator(':scope >>> #userDropdown'),
				targetPage.locator('::-p-text(Faça Login)')
			])
				.setTimeout(timeout)
				.click({
					offset: {
						x: 79.109375,
						y: 36
					}
				});
		}
		{
			const targetPage = page;
			await Locator.race([
				targetPage.locator('::-p-aria(E-Mail:)'),
				targetPage.locator('#email'),
				targetPage.locator('::-p-xpath(//*[@id=\\"email\\"])'),
				targetPage.locator(':scope >>> #email')
			])
				.setTimeout(timeout)
				.click({
					offset: {
						x: 203,
						y: 22
					}
				});
		}
		{
			const targetPage = page;
			await Locator.race([
				targetPage.locator('::-p-aria(E-Mail:)'),
				targetPage.locator('#email'),
				targetPage.locator('::-p-xpath(//*[@id=\\"email\\"])'),
				targetPage.locator(':scope >>> #email')
			])
				.setTimeout(timeout)
				.fill(this.login);
		}
		{
			const targetPage = page;
			await Locator.race([
				targetPage.locator('::-p-aria(Senha:)'),
				targetPage.locator('#password'),
				targetPage.locator('::-p-xpath(//*[@id=\\"password\\"])'),
				targetPage.locator(':scope >>> #password')
			])
				.setTimeout(timeout)
				.click({
					offset: {
						x: 96,
						y: 18
					}
				});
		}
		{
			const targetPage = page;
			await Locator.race([
				targetPage.locator('::-p-aria(Senha:)'),
				targetPage.locator('#password'),
				targetPage.locator('::-p-xpath(//*[@id=\\"password\\"])'),
				targetPage.locator(':scope >>> #password')
			])
				.setTimeout(timeout)
				.fill(this.password);
		}
		{
			const targetPage = page;
			const promises = [];
			const startWaitingForEvents = () => {
				promises.push(targetPage.waitForNavigation());
			};
			await Locator.race([
				targetPage.locator('::-p-aria(Fazer Login)'),
				targetPage.locator('div.navbar-right button'),
				targetPage.locator(
					'::-p-xpath(//*[@id=\\"main-wrapper\\"]/nav/div/div[2]/div/div/div/form/center/button)'
				),
				targetPage.locator(':scope >>> div.navbar-right button'),
				targetPage.locator('::-p-text(Fazer Login)')
			])
				.setTimeout(timeout)
				.on('action', () => startWaitingForEvents())
				.click({
					offset: {
						x: 57.71875,
						y: 25
					}
				});
			await Promise.all(promises);
		}
		this.page = page;
	}
	async _getMangaFromURI(uri) {
		const request = new Request(uri, this.requestOptions);
		const data = await this.fetchDOM(
			request,
			'div.ep_comic_info span.comic_tit span'
		);
		return new Manga(this, uri.pathname, data[0].textContent.trim());
	}
	async close() {
		await this.page?.close().catch(() => {});
		await this.browser.close();
		this.page = null;
		this.browser = null;
	}

	async _getMangas() {
		let mangas = [];

		try {
			await this.access();
			const response = await this.page.goto(this.url + '/comics');
			if (response.status() !== 200)
				throw new ServiceError({
					message: `Falha ao acessar "TopToonCO", status retornado ${response.status()}`
				});

			const data = await this.page.evaluate(`
					new Promise( resolve => {
							resolve( [...document.querySelectorAll('#main-wrapper > section.anime.blackout > div > div > div > div > a')].map(img => ({
								url: img.pathname,
								text: img.textContent,
								})) );
					} );
					`);

			for (let manga of data) {
				const a = {
					id: manga?.url,
					title: manga.text
						?.trim()
						?.replace(/\s+\d{2}(?: Final)?$/, '')
						?.trim()
				};
				if (a.title?.includes('...')) {
					await this.page.goto(this.url + a.id);
					const content = await this.page.evaluate(`
						new Promise( resolve => {
								resolve( [...document.querySelectorAll('#main-wrapper > section.video.bg-mobile > div > div > div.col-lg-9.col-12 > div > div.col-lg-8.col-md-5.col-12 > div > h2:nth-child(2)')].map(img => ({
									text: img.textContent,
									})) );
						} );
						`);
					// const newTitle = await this.fetchDOM(
					// 	request,
					// 	'#main-wrapper > section.video.bg-mobile > div > div > div.col-lg-9.col-12 > div > div.col-lg-8.col-md-5.col-12 > div > h2:nth-child(2)'
					// );
					a.title = content[0]?.text ?? a.title;
				}
				mangas.push(a);
			}
		} catch (error) {
			console.log(1);
		} finally {
			await this.close().catch(() => {});
		}

		return mangas;
	}

	async _getChapters(manga) {
		try {
			await this.access();
			await this.page.goto(this.url + manga.id);
			const data = await this.page.evaluate(`
				new Promise( resolve => {
						resolve( [...document.querySelectorAll('#capitulosList > h5 > a:nth-child(3)')].map(img => ({
							url: img.pathname,
							text: img.textContent,
							})) );
				} );
				`);
			const returnData = [];
			for (const element of data) {
				// const ch = await Promise.resolve([...element.children]);
				// const isVip = ch.some((item) => item.outerHTML.includes('class="vip"'));
				// if (isVip) continue;
				const dataFormatted = {
					id: element.url,
					title: element.text?.trim(),
					language: 'pt'
				};
				returnData.push(dataFormatted);
			}
			return returnData;
		} catch (e) {
			console.log(e);
			throw e;
		} finally {
			await this.close();
		}
	}

	async _getPages(chapter) {
		try {
			await this.access();
			await this.page.goto(this.url + chapter.id);
			const data = await this.page.evaluate(`
				new Promise( resolve => {
						resolve( [...document.querySelectorAll('#main-wrapper > section.chapter.blackout > div > div.img-capitulos.pt-4 > div > div > canvas')].map(img => img.outerHTML,
							) );
				} );
				`);
			return data
				.map((element) =>
					element.split('"').find((item) => item.includes('/assets/obras/'))
				)
				.map((item) => this.url + item);
		} catch (error) {
			throw error;
		} finally {
			await this.close();
		}
	}
}

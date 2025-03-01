import AdmZip from 'adm-zip';
import logger from '../infra/logger.js';

function getPathMangaAndChapter({ title, volume = 0 }) {
	const mangaPath = resolve('downloads', title);
	return {
		mangaPath,
		chapterPath: join(mangaPath, `${volume}.cbz`)
	};
}

async function downloadChapter({ manga, chapter, pages, cookie, userAgent }) {
	const paths = getPathMangaAndChapter({ title: manga, volume: chapter });
	const pathFolder = paths.mangaPath;
	await mkdir(pathFolder, { recursive: true });
	const pathFile = paths.chapterPath;
	await rm(pathFile, {
		recursive: true
	}).catch(() => {});
	logger.info({ manga, chapter, status: 'inicio' });
	const zip = new AdmZip();
	const imagesType = ['png', 'jpeg', 'jpg', 'avif'];
	let counter = 1;
	for (const page of pages) {
		const start = performance.now();
		const image = await downloadImage({ url: page, cookie, userAgent });
		if (page.endsWith('.zip')) {
			const imageZip = new AdmZip(image);
			const zipEntries = imageZip.getEntries();
			for (const entry of zipEntries) {
				if (imagesType.some((item) => entry.name.endsWith(item))) {
					const name = entry.name.split('.');
					name.pop();
					const { imageFormatted, type } = await processImage(entry.getData());
					zip.addFile(`${name.join('.')}.${type}`, imageFormatted);
				}
			}
		} else {
			const { imageFormatted, type } = await processImage(image);
			zip.addFile(`${counter}.${type}`, imageFormatted);
		}
		counter++;
		const totalTime = performance.now() - start;
		if (1000 > totalTime && page.includes('mangadex')) {
			const missing = 1000 - totalTime;
			await setTimeout(missing);
		}
	}

	await zip.writeZipPromise(pathFile);
}

import axios from 'axios';
import sharp from 'sharp';
import { setTimeout } from 'node:timers/promises';
import { mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export async function downloadImage({ url, cookie, userAgent }) {
	return axios({
		url,
		method: 'GET',
		responseType: 'arraybuffer',
		headers: {
			referer: new URL(url).origin,
			cookie,
			'User-Agent':
				userAgent ??
				'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:129.0) Gecko/20100101 Firefox/129.0'
		}
	}).then(({ data }) => Buffer.from(data, 'base64'));
}

async function processImage(image) {
	const options = ['webp', 'png'];
	for (const imageFormat of options) {
		try {
			const result = await sharp(image)
				.toFormat(imageFormat)
				.webp({
					quality: 80
				})
				.toBuffer();
			return { imageFormatted: result, type: imageFormat };
		} catch (error) {}
	}
	return { imageFormatted: image, type: 'png' };
}

const Download = {
	downloadChapter,
	getPathMangaAndChapter
};

export default Download;

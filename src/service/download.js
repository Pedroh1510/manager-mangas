import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rm } from 'node:fs/promises';
import path, { join, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import AdmZip from 'adm-zip';
import archiver from 'archiver';
import logger from '../infra/logger.js';
import { withDomainSlot } from './domainConcurrency.js';
import { PageNotFoundError, downloadImage } from './imageDownloader.js';
import { convertImage } from './imageProcessor.js';

const ZIP_COMPRESSION_LEVEL = 9;
const IMAGE_EXTENSIONS = ['png', 'jpeg', 'jpg', 'avif'];

function getPathMangaAndChapter({ title, volume = 0 }) {
	const mangaPath = resolve('downloads', title);
	return {
		mangaPath,
		chapterPath: join(mangaPath, `${volume}.cbz`),
	};
}

async function deleteChapterFile({ title, volume }) {
	const { mangaPath, chapterPath } = getPathMangaAndChapter({ title, volume });
	const normalizedPath = join(mangaPath, `${Number(volume)}.cbz`);
	await rm(chapterPath, { force: true });
	if (normalizedPath !== chapterPath) {
		await rm(normalizedPath, { force: true });
	}
}

function downloadPage({ page, cookie, userAgent }) {
	return withDomainSlot(page, () =>
		downloadImage({ url: page, cookie, userAgent }),
	);
}

function stripExtension(fileName) {
	return fileName.split('.').slice(0, -1).join('.');
}

async function appendZipBundlePages(archive, imageZipBuffer, state) {
	const imageZip = new AdmZip(imageZipBuffer);
	const entries = imageZip
		.getEntries()
		.filter((entry) =>
			IMAGE_EXTENSIONS.some((ext) => entry.name.endsWith(ext)),
		);

	await Promise.all(
		entries.map(async (entry) => {
			const { imageFormatted, type } = await convertImage(entry.getData());
			if (state.aborted) return;
			archive.append(imageFormatted, {
				name: `${stripExtension(entry.name)}.${type}`,
			});
		}),
	);
}

async function appendPageToArchive({
	archive,
	page,
	cookie,
	userAgent,
	index,
	manga,
	chapter,
	state,
}) {
	logger.info({ manga, chapter, page, status: 'baixando' });
	const start = performance.now();
	const image = await downloadPage({ page, cookie, userAgent });
	if (state.aborted) return;

	if (page.endsWith('.zip')) {
		await appendZipBundlePages(archive, image, state);
	} else {
		const { imageFormatted, type } = await convertImage(image);
		if (state.aborted) return;
		archive.append(imageFormatted, { name: `${index + 1}.${type}` });
	}

	logger.info({
		manga,
		chapter,
		page,
		status: 'processando',
		totalTime: performance.now() - start,
	});
}

function createChapterArchive(chapterPath) {
	const archive = archiver('zip', { zlib: { level: ZIP_COMPRESSION_LEVEL } });
	const output = createWriteStream(chapterPath);
	const finished = new Promise((resolvePromise, reject) => {
		output.on('close', resolvePromise);
		archive.on('error', reject);
		output.on('error', reject);
	});
	archive.pipe(output);
	return { archive, output, finished };
}

async function abortChapterDownload({
	archive,
	output,
	chapterPath,
	manga,
	chapter,
	error,
}) {
	if (error instanceof PageNotFoundError) {
		logger.warn({
			manga,
			chapter,
			page: error.url,
			status: 'capitulo_ignorado_404',
		});
	}
	archive.abort();
	output.destroy();
	await rm(chapterPath, { recursive: true }).catch(() => {});
}

async function downloadChapter({ manga, chapter, pages, cookie, userAgent }) {
	const { mangaPath, chapterPath } = getPathMangaAndChapter({
		title: manga,
		volume: chapter,
	});
	await mkdir(mangaPath, { recursive: true });
	await rm(chapterPath, { recursive: true }).catch(() => {});
	logger.info({ manga, chapter, status: 'inicio' });

	const { archive, output, finished } = createChapterArchive(chapterPath);
	const state = { aborted: false };
	const tasks = pages.map((page, index) =>
		appendPageToArchive({
			archive,
			page,
			cookie,
			userAgent,
			index,
			manga,
			chapter,
			state,
		}),
	);

	try {
		await Promise.all(tasks);
	} catch (error) {
		state.aborted = true;
		for (const task of tasks) {
			task.catch(() => {});
		}
		finished.catch(() => {});
		await abortChapterDownload({
			archive,
			output,
			chapterPath,
			manga,
			chapter,
			error,
		});
		throw error;
	}

	await archive.finalize();
	await finished;
}

async function downloadMangaFromDisk({ title, volume }) {
	if (volume !== undefined) {
		volume = Number.parseFloat(volume).toFixed(4);
	}
	const { chapterPath, mangaPath } = getPathMangaAndChapter({ title, volume });

	const zip = archiver('zip');
	if (volume === undefined) {
		const files = await readdir(mangaPath);
		for (const file of files) {
			zip.append(createReadStream(path.join(mangaPath, file)), {
				name: file,
			});
		}
	} else {
		zip.append(createReadStream(chapterPath), {
			name: chapterPath.split('/').pop(),
		});
	}
	const output = new PassThrough();
	zip.pipe(output);
	zip.finalize();
	return output;
}

const Download = {
	downloadChapter,
	getPathMangaAndChapter,
	downloadMangaFromDisk,
	deleteChapterFile,
};

export default Download;

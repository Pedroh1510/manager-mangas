import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rm } from 'node:fs/promises';
import path, { dirname, join, resolve, sep } from 'node:path';
import { PassThrough } from 'node:stream';
import AdmZip from 'adm-zip';
import archiver from 'archiver';
import { BadRequestError } from '../infra/errors.js';
import logger from '../infra/logger.js';
import { createConcurrencyLimiter } from './concurrencyLimiter.js';
import { withDomainSlot } from './domainConcurrency.js';
import { PageNotFoundError, downloadImage } from './imageDownloader.js';
import { convertImage } from './imageProcessor.js';
import {
	PlaceholderChapterError,
	assertNotPlaceholderChapter,
	hashPageBytes,
} from './placeholderChapter.js';

// Bounds memory: each page in flight holds its downloaded and converted bytes.
const MAX_PAGES_IN_FLIGHT_PER_CHAPTER = 4;
const IMAGE_EXTENSIONS = ['png', 'jpeg', 'jpg', 'avif'];

/**
 * Resolves a path and refuses it unless it stays inside downloads/. The manga
 * title comes from the admin API body (CodeQL js/path-injection, PR #50), so a
 * title like "../../etc" must never reach mkdir/rm/createWriteStream.
 * @example assertInsideDownloads('downloads/Black Clover/1.cbz') // '/app/downloads/Black Clover/1.cbz'
 * @param {string} candidate
 * @returns {string} the resolved path
 */
function assertInsideDownloads(candidate) {
	const root = resolve('downloads');
	const resolved = resolve(candidate);
	if (resolved.startsWith(`${root}${sep}`)) return resolved;
	throw new BadRequestError({
		message: `Path "${candidate}" escapes the downloads root "${root}", expected a path inside it`,
		action: 'Verifique o título do mangá e o volume.',
	});
}

function getPathMangaAndChapter({ title, volume = 0 }) {
	const mangaPath = assertInsideDownloads(resolve('downloads', title));
	return {
		mangaPath,
		chapterPath: assertInsideDownloads(join(mangaPath, `${volume}.cbz`)),
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
	if (state.aborted) return;
	logger.info({ manga, chapter, page, status: 'baixando' });
	const start = performance.now();
	const image = await downloadPage({ page, cookie, userAgent });
	if (state.aborted) return;

	if (page.endsWith('.zip')) {
		await appendZipBundlePages(archive, image, state);
	} else {
		state.pageHashes.push(hashPageBytes(image));
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
	// Pages are already compressed images; deflate burns CPU for no gain.
	const archive = archiver('zip', { store: true });
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
	if (error instanceof PlaceholderChapterError) {
		logger.warn({ manga, chapter, status: 'capitulo_placeholder' });
	}
	archive.abort();
	output.destroy();
	await rm(chapterPath, { recursive: true }).catch(() => {});
}

/**
 * Downloads every page into one .cbz. `targetPath` lets a source replacement
 * write next to the live file and swap it only after success; every rm here
 * then hits the target, never the live chapter.
 * @example await downloadChapter({ manga: 'T', chapter: '177.0000', pages, targetPath: '/d/T/177.0000.cbz.replacing' })
 * @param {{ manga: string, chapter: string|number, pages: string[], cookie?: string|null, userAgent?: string|null, targetPath?: string }} params
 * @returns {Promise<void>}
 */
async function downloadChapter({
	manga,
	chapter,
	pages,
	cookie,
	userAgent,
	targetPath,
}) {
	const chapterPath = assertInsideDownloads(
		targetPath ??
			getPathMangaAndChapter({ title: manga, volume: chapter }).chapterPath,
	);
	await mkdir(dirname(chapterPath), { recursive: true });
	await rm(chapterPath, { recursive: true }).catch(() => {});
	logger.info({ manga, chapter, status: 'inicio' });

	const { archive, output, finished } = createChapterArchive(chapterPath);
	const state = { aborted: false, pageHashes: [] };
	const runPageLimited = createConcurrencyLimiter(
		MAX_PAGES_IN_FLIGHT_PER_CHAPTER,
	);
	const tasks = pages.map((page, index) =>
		runPageLimited(() =>
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
		),
	);

	try {
		await Promise.all(tasks);
		assertNotPlaceholderChapter({ manga, chapter, hashes: state.pageHashes });
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

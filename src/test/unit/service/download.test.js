import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import { afterEach, describe, expect, test, vi } from 'vitest';

const tempZipPath = join(tmpdir(), `download-test-${randomUUID()}.cbz`);

vi.mock('node:fs', async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		default: {
			...actual.default,
			createWriteStream: () => actual.createWriteStream(tempZipPath),
		},
		createWriteStream: () => actual.createWriteStream(tempZipPath),
	};
});
vi.mock('node:fs/promises');
vi.mock('../../../service/imageDownloader.js', async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		downloadImage: vi.fn(async ({ url }) => Buffer.from(`bytes:${url}`)),
	};
});
vi.mock('../../../service/imageProcessor.js', () => ({
	convertImage: vi.fn(async (buffer) => ({
		imageFormatted: buffer,
		type: 'webp',
	})),
}));

const fsPromises = await import('node:fs/promises');
const Download = (await import('../../../service/download.js')).default;
const { downloadImage, PageNotFoundError } = await import(
	'../../../service/imageDownloader.js'
);
const { convertImage } = await import('../../../service/imageProcessor.js');

describe('Download.downloadChapter', () => {
	afterEach(async () => {
		vi.restoreAllMocks();
		downloadImage.mockReset();
		convertImage.mockReset();
		convertImage.mockImplementation(async (buffer) => ({
			imageFormatted: buffer,
			type: 'webp',
		}));
		rmSync(tempZipPath, { force: true });
	});

	function withFsPromisesReady() {
		fsPromises.mkdir.mockResolvedValue(undefined);
		fsPromises.rm.mockResolvedValue(undefined);
	}

	test('names each page by its position, regardless of completion order', async () => {
		withFsPromisesReady();
		const pages = [
			'https://a.example/1.jpg',
			'https://a.example/2.jpg',
			'https://a.example/3.jpg',
		];
		downloadImage.mockImplementation(async ({ url }) => {
			if (url.endsWith('/1.jpg')) {
				await new Promise((resolvePromise) => setTimeout(resolvePromise, 30));
			}
			return Buffer.from(`bytes:${url}`);
		});

		await Download.downloadChapter({ manga: 'Test Manga', chapter: 1, pages });

		const zip = new AdmZip(tempZipPath);
		const names = zip
			.getEntries()
			.map((entry) => entry.name)
			.sort();
		expect(names).toEqual(['1.webp', '2.webp', '3.webp']);
		expect(zip.getEntry('1.webp').getData().toString()).toBe(
			'bytes:https://a.example/1.jpg',
		);
		expect(zip.getEntry('3.webp').getData().toString()).toBe(
			'bytes:https://a.example/3.jpg',
		);
	});

	test('expands a bundled .zip page into its individual image entries', async () => {
		withFsPromisesReady();
		const bundle = new AdmZip();
		bundle.addFile('01.jpg', Buffer.from('page-one'));
		bundle.addFile('02.jpg', Buffer.from('page-two'));
		downloadImage.mockResolvedValue(bundle.toBuffer());

		await Download.downloadChapter({
			manga: 'Test Manga',
			chapter: 2,
			pages: ['https://a.example/bundle.zip'],
		});

		const zip = new AdmZip(tempZipPath);
		const names = zip
			.getEntries()
			.map((entry) => entry.name)
			.sort();
		expect(names).toEqual(['01.webp', '02.webp']);
	});

	test('aborts the whole chapter and deletes the partial file when a page 404s', async () => {
		withFsPromisesReady();
		const pages = [
			'https://a.example/1.jpg',
			'https://a.example/missing.jpg',
			'https://a.example/3.jpg',
		];
		downloadImage.mockImplementation(async ({ url }) => {
			if (url.endsWith('missing.jpg')) {
				throw new PageNotFoundError(url);
			}
			await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
			return Buffer.from(`bytes:${url}`);
		});

		await expect(
			Download.downloadChapter({ manga: 'Test Manga', chapter: 4, pages }),
		).rejects.toThrow(PageNotFoundError);

		expect(fsPromises.rm).toHaveBeenLastCalledWith(
			expect.stringContaining('4.cbz'),
			{ recursive: true },
		);
	});
});

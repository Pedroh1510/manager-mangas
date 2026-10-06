import { afterEach, describe, expect, test, vi } from 'vitest';

const toBufferMock = vi.fn();
const toFormatMock = vi.fn(() => ({ toBuffer: toBufferMock }));
const metadataMock = vi.fn(async () => ({ height: 1200 }));
vi.mock('sharp', () => {
	const sharpFactory = vi.fn(() => ({
		toFormat: toFormatMock,
		metadata: metadataMock,
	}));
	sharpFactory.concurrency = vi.fn();
	sharpFactory.cache = vi.fn();
	return { default: sharpFactory };
});
vi.mock('../../../infra/logger.js', () => ({
	default: { warn: vi.fn() },
}));

const { convertImage, createImageConverter } = await import(
	'../../../service/imageProcessor.js'
);
const sharp = (await import('sharp')).default;
const logger = (await import('../../../infra/logger.js')).default;
const CONFIG_ENV = (await import('../../../infra/env.js')).default;

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF_BYTES = Buffer.from('GIF89a-rest', 'latin1');
const WEBP_BYTES = Buffer.concat([
	Buffer.from('RIFF', 'latin1'),
	Buffer.from([0x24, 0x00, 0x00, 0x00]),
	Buffer.from('WEBPVP8 ', 'latin1'),
]);
const AVIF_BYTES = Buffer.concat([
	Buffer.from([0x00, 0x00, 0x00, 0x1c]),
	Buffer.from('ftypavif', 'latin1'),
]);
const UNKNOWN_BYTES = Buffer.from('not an image at all', 'latin1');

function enabledConverter(concurrency = 4) {
	return createImageConverter({ isEnabled: true, concurrency });
}

describe('imageProcessor module setup', () => {
	test('configures sharp to a single thread and no cache', () => {
		expect(sharp.concurrency).toHaveBeenCalledWith(1);
		expect(sharp.cache).toHaveBeenCalledWith(false);
	});
});

describe('convertImage', () => {
	afterEach(() => {
		toBufferMock.mockReset();
		toFormatMock.mockClear();
		metadataMock.mockReset();
		metadataMock.mockResolvedValue({ height: 1200 });
		sharp.mockClear();
		logger.warn.mockClear();
	});

	test('encodes jpeg as webp quality 100', async () => {
		const webpBuffer = Buffer.from('webp-data');
		toBufferMock.mockResolvedValueOnce(webpBuffer);

		const result = await enabledConverter()(JPEG_BYTES);

		expect(result).toEqual({ imageFormatted: webpBuffer, type: 'webp' });
		expect(toFormatMock).toHaveBeenCalledWith('webp', { quality: 100 });
	});

	test('encodes png as webp quality 100', async () => {
		const webpBuffer = Buffer.from('webp-data');
		toBufferMock.mockResolvedValueOnce(webpBuffer);

		const result = await enabledConverter()(PNG_BYTES);

		expect(result).toEqual({ imageFormatted: webpBuffer, type: 'webp' });
		expect(toFormatMock).toHaveBeenCalledWith('webp', { quality: 100 });
	});

	test('never encodes avif', async () => {
		toBufferMock.mockRejectedValue(new Error('encode failed'));

		await enabledConverter()(JPEG_BYTES);
		await enabledConverter()(PNG_BYTES);

		const formats = toFormatMock.mock.calls.map(([format]) => format);
		expect(formats).not.toContain('avif');
		expect(formats.length).toBeGreaterThan(0);
	});

	test('keeps original bytes when conversion is disabled', async () => {
		const convert = createImageConverter({ isEnabled: false, concurrency: 1 });
		const cases = [
			[JPEG_BYTES, 'jpg'],
			[PNG_BYTES, 'png'],
			[WEBP_BYTES, 'webp'],
			[AVIF_BYTES, 'avif'],
			[GIF_BYTES, 'gif'],
		];

		for (const [source, type] of cases) {
			const result = await convert(source);
			expect(result.type).toBe(type);
			expect(result.imageFormatted).toBe(source);
		}
		expect(sharp).not.toHaveBeenCalled();
	});

	test('keeps webp and avif sources untouched', async () => {
		const convert = enabledConverter();

		const webpResult = await convert(WEBP_BYTES);
		const avifResult = await convert(AVIF_BYTES);

		expect(webpResult).toEqual({ imageFormatted: WEBP_BYTES, type: 'webp' });
		expect(webpResult.imageFormatted).toBe(WEBP_BYTES);
		expect(avifResult).toEqual({ imageFormatted: AVIF_BYTES, type: 'avif' });
		expect(avifResult.imageFormatted).toBe(AVIF_BYTES);
		expect(toFormatMock).not.toHaveBeenCalled();
	});

	test('skips encoding above 16383 px tall', async () => {
		const convert = enabledConverter();
		metadataMock.mockResolvedValueOnce({ height: 16384 });

		const tall = await convert(JPEG_BYTES);

		expect(tall.imageFormatted).toBe(JPEG_BYTES);
		expect(tall.type).toBe('jpg');
		expect(toFormatMock).not.toHaveBeenCalled();

		metadataMock.mockResolvedValueOnce({ height: 16383 });
		toBufferMock.mockResolvedValueOnce(Buffer.from('webp-data'));

		const limit = await convert(JPEG_BYTES);

		expect(limit.type).toBe('webp');
		expect(toFormatMock).toHaveBeenCalledTimes(1);
	});

	test('falls back to the original bytes with the detected extension', async () => {
		toBufferMock.mockRejectedValueOnce(new Error('encode failed'));

		const result = await enabledConverter()(JPEG_BYTES);

		expect(result.imageFormatted).toBe(JPEG_BYTES);
		expect(result.type).toBe('jpg');
		expect(logger.warn).toHaveBeenCalledWith(
			expect.objectContaining({ format: 'webp', status: 'conversao_falhou' }),
		);
	});

	test('labels unknown formats as png', async () => {
		const disabled = createImageConverter({ isEnabled: false, concurrency: 1 });
		toBufferMock.mockRejectedValueOnce(new Error('encode failed'));

		const withoutConversion = await disabled(UNKNOWN_BYTES);
		const afterFailedEncode = await enabledConverter()(UNKNOWN_BYTES);

		expect(withoutConversion).toEqual({
			imageFormatted: UNKNOWN_BYTES,
			type: 'png',
		});
		expect(afterFailedEncode).toEqual({
			imageFormatted: UNKNOWN_BYTES,
			type: 'png',
		});
	});

	test('caps concurrent encodes at the configured limit', async () => {
		let active = 0;
		let maxActive = 0;
		toBufferMock.mockImplementation(async () => {
			active++;
			maxActive = Math.max(maxActive, active);
			await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
			active--;
			return Buffer.from('webp-data');
		});

		const convertTwo = enabledConverter(2);
		await Promise.all(Array.from({ length: 6 }, () => convertTwo(JPEG_BYTES)));
		expect(maxActive).toBe(2);

		maxActive = 0;
		const convertOne = enabledConverter(1);
		await Promise.all(Array.from({ length: 6 }, () => convertOne(JPEG_BYTES)));
		expect(maxActive).toBe(1);
	});

	test('shared convertImage caps encodes at IMAGE_CONVERSION_CONCURRENCY', async () => {
		let active = 0;
		let maxActive = 0;
		toBufferMock.mockImplementation(async () => {
			active++;
			maxActive = Math.max(maxActive, active);
			await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
			active--;
			return Buffer.from('webp-data');
		});
		const limit = CONFIG_ENV.IMAGE_CONVERSION_CONCURRENCY;

		await Promise.all(
			Array.from({ length: limit + 3 }, () => convertImage(JPEG_BYTES)),
		);

		expect(maxActive).toBe(limit);
	});
});

import { afterEach, describe, expect, test, vi } from 'vitest';

const toBufferMock = vi.fn();
const toFormatMock = vi.fn(() => ({ toBuffer: toBufferMock }));
vi.mock('sharp', () => ({
	default: vi.fn(() => ({ toFormat: toFormatMock })),
}));
vi.mock('../../../infra/logger.js', () => ({
	default: { warn: vi.fn() },
}));

const { convertImage } = await import('../../../service/imageProcessor.js');
const sharp = (await import('sharp')).default;
const logger = (await import('../../../infra/logger.js')).default;

describe('convertImage', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		toBufferMock.mockReset();
		toFormatMock.mockClear();
		sharp.mockClear();
	});

	test('returns avif when encoding succeeds', async () => {
		const avifBuffer = Buffer.from('avif-data');
		toBufferMock.mockResolvedValueOnce(avifBuffer);

		const result = await convertImage(Buffer.from('source'));

		expect(result).toEqual({ imageFormatted: avifBuffer, type: 'avif' });
		expect(toFormatMock).toHaveBeenCalledWith('avif', { quality: 60 });
	});

	test('falls back to webp when avif fails', async () => {
		const webpBuffer = Buffer.from('webp-data');
		toBufferMock
			.mockRejectedValueOnce(new Error('avif unsupported'))
			.mockResolvedValueOnce(webpBuffer);

		const result = await convertImage(Buffer.from('source'));

		expect(result).toEqual({ imageFormatted: webpBuffer, type: 'webp' });
		expect(logger.warn).toHaveBeenCalledWith(
			expect.objectContaining({ format: 'avif', status: 'conversao_falhou' }),
		);
	});

	test('falls back to the original buffer labeled png when every format fails', async () => {
		toBufferMock.mockRejectedValue(new Error('encode failed'));
		const source = Buffer.from('source');

		const result = await convertImage(source);

		expect(result).toEqual({ imageFormatted: source, type: 'png' });
		expect(logger.warn).toHaveBeenCalledTimes(2);
	});
});

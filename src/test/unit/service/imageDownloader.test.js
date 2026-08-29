import { afterEach, describe, expect, test, vi } from 'vitest';

const axiosMock = vi.fn();
vi.mock('axios', () => ({ default: (...args) => axiosMock(...args) }));
vi.mock('../../../infra/logger.js', () => ({
	default: { warn: vi.fn() },
}));

const { downloadImage, PageNotFoundError } = await import(
	'../../../service/imageDownloader.js'
);
const logger = (await import('../../../infra/logger.js')).default;

describe('downloadImage', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		axiosMock.mockReset();
	});

	test('returns the image buffer on success', async () => {
		axiosMock.mockResolvedValueOnce({ data: Buffer.from('image-bytes') });

		const result = await downloadImage({ url: 'https://a.example/1.jpg' });

		expect(result).toEqual(Buffer.from('image-bytes'));
		expect(axiosMock).toHaveBeenCalledTimes(1);
		expect(axiosMock).toHaveBeenCalledWith(
			expect.objectContaining({
				url: 'https://a.example/1.jpg',
				timeout: 2 * 60 * 1000,
			}),
		);
	});

	test('retries with increasing timeout and succeeds on a later attempt', async () => {
		axiosMock
			.mockRejectedValueOnce(new Error('timeout'))
			.mockRejectedValueOnce(new Error('timeout'))
			.mockResolvedValueOnce({ data: Buffer.from('ok') });

		const result = await downloadImage({ url: 'https://a.example/1.jpg' });

		expect(result).toEqual(Buffer.from('ok'));
		expect(axiosMock).toHaveBeenCalledTimes(3);
		expect(axiosMock.mock.calls[0][0].timeout).toBe(2 * 60 * 1000);
		expect(axiosMock.mock.calls[1][0].timeout).toBe(4 * 60 * 1000);
		expect(axiosMock.mock.calls[2][0].timeout).toBe(6 * 60 * 1000);
		expect(logger.warn).toHaveBeenCalledTimes(2);
	});

	test('throws the last error after exhausting all attempts', async () => {
		axiosMock.mockRejectedValue(new Error('network down'));

		await expect(
			downloadImage({ url: 'https://a.example/1.jpg' }),
		).rejects.toThrow('network down');
		expect(axiosMock).toHaveBeenCalledTimes(3);
	});

	test('throws PageNotFoundError immediately on 404, without retrying', async () => {
		axiosMock.mockRejectedValue(
			Object.assign(new Error('Request failed with status code 404'), {
				response: { status: 404 },
			}),
		);

		await expect(
			downloadImage({ url: 'https://a.example/missing.jpg' }),
		).rejects.toThrow(PageNotFoundError);
		expect(axiosMock).toHaveBeenCalledTimes(1);
		expect(logger.warn).not.toHaveBeenCalled();
	});
});

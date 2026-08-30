import { afterEach, describe, expect, test, vi } from 'vitest';

const axiosMock = vi.fn();
const axiosCreateMock = vi.fn(() => axiosMock);
vi.mock('axios', () => ({
	default: { create: (...args) => axiosCreateMock(...args) },
}));
vi.mock('../../../infra/env.js', () => ({
	default: { KAVITA_URL: 'http://kavita.test', KAVITA_API_KEY: 'the-api-key' },
}));

const KavitaClient = (await import('../../../infra/kavitaClient.js')).default;

describe('KavitaClient', () => {
	afterEach(() => {
		axiosMock.mockReset();
	});

	test('axios instance is created with the configured baseURL', () => {
		expect(axiosCreateMock).toHaveBeenCalledWith({ baseURL: 'http://kavita.test' });
	});

	describe('checkHealth', () => {
		test('returns true when the health endpoint responds 200', async () => {
			axiosMock.mockResolvedValueOnce({ status: 200 });

			expect(await KavitaClient.checkHealth()).toBe(true);
			expect(axiosMock).toHaveBeenCalledWith(
				expect.objectContaining({ method: 'get', url: '/api/health' }),
			);
		});

		test('returns false when the request rejects', async () => {
			axiosMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

			expect(await KavitaClient.checkHealth()).toBe(false);
		});
	});

	describe('authenticate', () => {
		test('returns the token on success', async () => {
			axiosMock.mockResolvedValueOnce({ data: { token: 'jwt-123' } });

			expect(await KavitaClient.authenticate()).toBe('jwt-123');
			expect(axiosMock).toHaveBeenCalledWith(
				expect.objectContaining({
					method: 'post',
					url: '/api/plugin/authenticate',
					params: { apiKey: 'the-api-key', pluginName: 'manager-mangas' },
				}),
			);
		});

		test('returns null when the request rejects', async () => {
			axiosMock.mockRejectedValueOnce(new Error('401'));

			expect(await KavitaClient.authenticate()).toBe(null);
		});
	});

	describe('searchSeries', () => {
		test('returns the series list from the search response', async () => {
			axiosMock.mockResolvedValueOnce({
				data: { series: [{ seriesId: 7, name: 'Black Clover', libraryId: 1 }] },
			});

			const result = await KavitaClient.searchSeries({
				title: 'Black Clover',
				token: 'jwt-123',
			});

			expect(result).toEqual([{ seriesId: 7, name: 'Black Clover', libraryId: 1 }]);
			expect(axiosMock).toHaveBeenCalledWith(
				expect.objectContaining({
					method: 'get',
					url: '/api/search/search',
					params: { queryString: 'Black Clover', includeChapterAndFiles: false },
					headers: { Authorization: 'Bearer jwt-123' },
				}),
			);
		});

		test('returns an empty array when the response has no series field', async () => {
			axiosMock.mockResolvedValueOnce({ data: {} });

			const result = await KavitaClient.searchSeries({ title: 'X', token: 't' });

			expect(result).toEqual([]);
		});
	});

	describe('getSeriesVolumes', () => {
		test('returns the volumes array as-is', async () => {
			const volumes = [{ chapters: [{ minNumber: 1, pages: 20, pagesRead: 20 }] }];
			axiosMock.mockResolvedValueOnce({ data: volumes });

			const result = await KavitaClient.getSeriesVolumes({
				seriesId: 7,
				token: 'jwt-123',
			});

			expect(result).toEqual(volumes);
			expect(axiosMock).toHaveBeenCalledWith(
				expect.objectContaining({
					method: 'get',
					url: '/api/series/volumes',
					params: { seriesId: 7 },
					headers: { Authorization: 'Bearer jwt-123' },
				}),
			);
		});
	});

	describe('scanSeries', () => {
		test('posts libraryId and seriesId', async () => {
			axiosMock.mockResolvedValueOnce({ status: 200 });

			await KavitaClient.scanSeries({ libraryId: 1, seriesId: 7, token: 'jwt-123' });

			expect(axiosMock).toHaveBeenCalledWith(
				expect.objectContaining({
					method: 'post',
					url: '/api/series/scan',
					data: { libraryId: 1, seriesId: 7 },
					headers: { Authorization: 'Bearer jwt-123' },
				}),
			);
		});
	});
});

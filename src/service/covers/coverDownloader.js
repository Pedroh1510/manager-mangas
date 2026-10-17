import axios from 'axios';
import sharp from 'sharp';
import { DEFAULT_USER_AGENT } from '../imageDownloader.js';

// A cover answers an <img> request, so one short attempt beats the page
// downloader's 3 attempts of 2-6 minutes each (manga-covers assumptions).
export const COVER_TIMEOUT_MS = 15_000;
export const COVER_MAX_BYTES = 10 * 1024 * 1024;
export const COVER_MAX_WIDTH = 300;

/**
 * Normalizes any decodable image to a WebP at most COVER_MAX_WIDTH wide;
 * rejects when sharp cannot decode the bytes (an HTML error page, say).
 * @example await toCoverWebp(pngBuffer) // Buffer (webp)
 * @param {Buffer} image
 * @returns {Promise<Buffer>}
 */
export function toCoverWebp(image) {
	return sharp(image)
		.resize({ width: COVER_MAX_WIDTH, withoutEnlargement: true })
		.webp()
		.toBuffer();
}

/**
 * Builds a downloader that fetches a cover once and returns it as WebP.
 * Rejects on a non-2xx status, past `timeoutMs` in total, past `maxBytes`,
 * or when the body is not an image.
 * @example const downloadCover = createCoverDownloader(); await downloadCover('https://h/a.jpg')
 */
export function createCoverDownloader({
	request = axios,
	timeoutMs = COVER_TIMEOUT_MS,
	maxBytes = COVER_MAX_BYTES,
} = {}) {
	return async function downloadCover(url) {
		const { data } = await request({
			url,
			method: 'GET',
			responseType: 'arraybuffer',
			headers: {
				referer: new URL(url).origin,
				'User-Agent': DEFAULT_USER_AGENT,
			},
			timeout: timeoutMs,
			// axios' timeout only bounds an idle socket; this bounds the whole body.
			signal: AbortSignal.timeout(timeoutMs),
			maxContentLength: maxBytes,
		});
		return toCoverWebp(Buffer.from(data));
	};
}

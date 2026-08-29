import axios from 'axios';
import logger from '../infra/logger.js';

const MAX_ATTEMPTS = 3;
const BASE_TIMEOUT_MS = 2 * 60 * 1000;
const TIMEOUT_INCREMENT_MS = 2 * 60 * 1000;
const DEFAULT_USER_AGENT =
	'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:129.0) Gecko/20100101 Firefox/129.0';

export class PageNotFoundError extends Error {
	constructor(url) {
		super(`Página não encontrada (404): ${url}`);
		this.name = 'PageNotFoundError';
		this.url = url;
	}
}

function getTimeoutForAttempt(attempt) {
	return BASE_TIMEOUT_MS + attempt * TIMEOUT_INCREMENT_MS;
}

function isNotFound(error) {
	return error.response?.status === 404;
}

async function requestImage({ url, cookie, userAgent, timeout }) {
	const { data } = await axios({
		url,
		method: 'GET',
		responseType: 'arraybuffer',
		headers: {
			referer: new URL(url).origin,
			cookie,
			'User-Agent': userAgent ?? DEFAULT_USER_AGENT,
		},
		timeout,
	});
	return Buffer.from(data);
}

/**
 * Downloads a single page image, retrying up to MAX_ATTEMPTS times with an
 * increasing timeout (2min, 4min, 6min) before giving up.
 */
export async function downloadImage({ url, cookie, userAgent }) {
	let lastError;
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const timeout = getTimeoutForAttempt(attempt);
		try {
			return await requestImage({ url, cookie, userAgent, timeout });
		} catch (error) {
			if (isNotFound(error)) {
				throw new PageNotFoundError(url);
			}
			lastError = error;
			logger.warn({
				url,
				attempt: attempt + 1,
				timeout,
				error: error.message,
				status: 'download_falhou',
			});
		}
	}
	throw lastError;
}

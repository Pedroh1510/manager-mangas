import { createServer } from 'node:http';

// GET /mangas/download carries every page URL in the query string: 115 pages
// is ~12.6 KB and Node's 16 KiB default answers 431 from ~145 pages (wicomix
// Round 2 verification, 2026-10-25). 64 KiB fits ~580 pages.
export const MAX_HEADER_BYTES = 64 * 1024;

/**
 * Starts an HTTP server for `app` with the project's header-size limit.
 * @example listenHttp(expressApp, 3001, () => logger.info('up'))
 * @param {import('node:http').RequestListener} app
 * @param {number | string} port
 * @param {() => void} onListening
 * @returns {import('node:http').Server}
 */
export function listenHttp(app, port, onListening) {
	return createServer({ maxHeaderSize: MAX_HEADER_BYTES }, app).listen(
		port,
		onListening,
	);
}

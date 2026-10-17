const COVER_CACHE_CONTROL = 'public, max-age=86400';

/**
 * Answers a cover request: the WebP bytes, or 404 with an empty body for
 * any "no cover" outcome (the front shows its placeholder either way).
 * @example sendCover(res, await CoverService.getLocalCover({ idManga }))
 * @param {import('express').Response} res
 * @param {Buffer|null} cover
 */
export function sendCover(res, cover) {
	if (!cover) return res.status(404).send();
	return res
		.status(200)
		.set('Content-Type', 'image/webp')
		.set('Cache-Control', COVER_CACHE_CONTROL)
		.send(cover);
}

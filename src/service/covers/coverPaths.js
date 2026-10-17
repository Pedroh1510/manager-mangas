import { createHash } from 'node:crypto';
import path from 'node:path';

// idMangaPlugin comes from the connector's site and reaches us through the
// URL, so it never becomes a path segment: its sha1 does (manga-covers door 3).
function hashId(idMangaPlugin) {
	return createHash('sha1').update(String(idMangaPlugin)).digest('hex');
}

/**
 * Builds the on-disk locations of catalog and local covers under `rootDir`.
 * `pluginId` must already be a registered connector id.
 * @example createCoverPaths('/app/appdata').localCover(7) // '/app/appdata/covers/7.webp'
 * @param {string} rootDir
 */
export function createCoverPaths(rootDir) {
	return {
		catalogCover: (pluginId, idMangaPlugin) =>
			path.join(
				rootDir,
				'covers-catalog',
				pluginId,
				`${hashId(idMangaPlugin)}.webp`,
			),
		localCover: (idManga) =>
			path.join(rootDir, 'covers', `${Number(idManga)}.webp`),
	};
}

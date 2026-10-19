import fs from 'node:fs/promises';
import path from 'node:path';

const CACHE_DIR = path.resolve('appdata');
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches current behavior

function cachePath(connectorId) {
	return path.join(CACHE_DIR, `mangas.${connectorId}.json`);
}

// Bumped when the cached item shape changes; an older file is still served
// but counts as stale, so the existing refresh rewrites it (manga-covers door 1).
export const CATALOG_VERSION = 3;

async function readCatalogFile(connectorId) {
	try {
		const raw = await fs.readFile(cachePath(connectorId), 'utf8');
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function isEnvelope(parsed) {
	return Number.isInteger(parsed?.version) && Array.isArray(parsed.mangas);
}

function isCurrentFormat(parsed) {
	return isEnvelope(parsed) && parsed.version === CATALOG_VERSION;
}

/**
 * Cached catalog items, from any versioned envelope or the legacy raw array;
 * an older envelope is still served while its refresh is pending (alt-titles AC 6).
 * @example await loadCatalog('mangeek') // [{ id: '1', title: 'A', coverUrl: '...' }] or null
 */
export async function loadCatalog(connectorId) {
	const parsed = await readCatalogFile(connectorId);
	if (Array.isArray(parsed)) return parsed;
	return isEnvelope(parsed) ? parsed.mangas : null;
}

/**
 * Envelope version of the cached catalog file; null for a missing file or
 * the legacy raw array.
 * @example await readCatalogVersion('mangeek') // 3 or null
 * @param {string} connectorId
 * @returns {Promise<number|null>}
 */
export async function readCatalogVersion(connectorId) {
	const parsed = await readCatalogFile(connectorId);
	return isEnvelope(parsed) ? parsed.version : null;
}

export async function saveCatalog(connectorId, mangas) {
	await fs.mkdir(CACHE_DIR, { recursive: true });
	// The worker rewrites this file while GET requests read it; rename is
	// atomic on the same filesystem, so a reader sees the old or the new
	// catalog, never a truncated one.
	const finalPath = cachePath(connectorId);
	const tmpPath = `${finalPath}.tmp`;
	await fs.writeFile(
		tmpPath,
		JSON.stringify({ version: CATALOG_VERSION, mangas }),
	);
	await fs.rename(tmpPath, finalPath);
}

export async function isStale(connectorId, maxAgeMs = MAX_AGE_MS) {
	try {
		const stats = await fs.stat(cachePath(connectorId));
		if (Date.now() - stats.mtimeMs > maxAgeMs) return true;
	} catch {
		return true;
	}
	return !isCurrentFormat(await readCatalogFile(connectorId));
}

import fs from 'node:fs/promises';
import path from 'node:path';

const CACHE_DIR = path.resolve('appdata');
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches current behavior

function cachePath(connectorId) {
  return path.join(CACHE_DIR, `mangas.${connectorId}.json`);
}

export async function loadCatalog(connectorId) {
  try {
    const raw = await fs.readFile(cachePath(connectorId), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveCatalog(connectorId, mangas) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(cachePath(connectorId), JSON.stringify(mangas));
}

export async function isStale(connectorId, maxAgeMs = MAX_AGE_MS) {
  try {
    const stats = await fs.stat(cachePath(connectorId));
    return Date.now() - stats.mtimeMs > maxAgeMs;
  } catch {
    return true;
  }
}

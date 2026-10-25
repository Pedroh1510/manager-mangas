import fs from 'node:fs/promises';
import path from 'node:path';

// Connector-private incremental state (plan door 3); losing it only costs a
// full sitemap sweep, so any unusable file reads as empty (plan AC 14).
export const INDEX_VERSION = 1;
export const DEFAULT_INDEX_PATH = path.resolve('appdata', 'wicomix.index.json');

/**
 * File-backed store for `{ slug: { lastmod, title, altTitles?, coverUrl?, novel } }`.
 * @example await createFileIndexStore('/tmp/i.json').save({ a: { lastmod: 'x', title: 'A', novel: false } })
 * @param {string} filePath
 * @returns {{load: () => Promise<Record<string, object>>, save: (entries: Record<string, object>) => Promise<void>}}
 */
export function createFileIndexStore(filePath = DEFAULT_INDEX_PATH) {
	return {
		load: () => loadIndexEntries(filePath),
		save: (entries) => saveIndexEntries(filePath, entries),
	};
}

async function loadIndexEntries(filePath) {
	try {
		const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
		const isUsable =
			parsed?.version === INDEX_VERSION && typeof parsed.entries === 'object';
		return isUsable && parsed.entries ? parsed.entries : {};
	} catch {
		return {};
	}
}

// Readers never see a half-written index: rename is atomic on one filesystem.
async function saveIndexEntries(filePath, entries) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	const tmpPath = `${filePath}.tmp`;
	await fs.writeFile(
		tmpPath,
		JSON.stringify({ version: INDEX_VERSION, entries }),
	);
	await fs.rename(tmpPath, filePath);
}

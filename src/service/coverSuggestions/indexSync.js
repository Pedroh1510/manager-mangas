import { createHash } from 'node:crypto';

const DAY_MS = 24 * 60 * 60 * 1000;
// Days to wait after the 1st, 2nd and 3rd failure; the 4th one stops retries
// until the coverUrl changes (cover-connector-suggestions AC 9, AC 10).
const BACKOFF_DAYS = [1, 3, 7];
const MAX_FAILURES = BACKOFF_DAYS.length + 1;

/**
 * BullMQ job id of one item's hash, so a second enqueue is a no-op.
 * @example hashJobId('mangeek', '1') // 'hash-mangeek-356a19...'
 */
export function hashJobId(idPlugin, idMangaPlugin) {
	const digest = createHash('sha1').update(String(idMangaPlugin)).digest('hex');
	return `hash-${idPlugin}-${digest}`;
}

function failureBackoffElapsed(row, now) {
	if (row.failureCount >= MAX_FAILURES) return false;
	const waitMs = BACKOFF_DAYS[row.failureCount - 1] * DAY_MS;
	return now - new Date(row.failedAt).getTime() >= waitMs;
}

/**
 * Whether a catalog item still needs a hash given its index row.
 * @example needsHash({ id: 'a', coverUrl: 'u' }, null, Date.now()) // true
 * @param {{id: string, coverUrl?: string}} item
 * @param {{coverUrl: string, dHash: bigint|null, failureCount: number, failedAt: Date|null} | null} row
 * @param {number} now
 * @returns {boolean}
 */
export function needsHash(item, row, now) {
	if (!item.coverUrl) return false;
	if (!row || row.coverUrl !== item.coverUrl) return true;
	if (row.dHash !== null) return false;
	if (!row.failureCount) return true;
	return failureBackoffElapsed(row, now);
}

/**
 * Builds the sync that keeps `catalogCoverHashes` in step with a catalog:
 * drops rows of removed items and enqueues every item needing a hash.
 * @example await createIndexSync(deps).syncConnector('nexustoons') // { enqueued: 13575, removed: 0 }
 */
export function createIndexSync({
	loadCatalog,
	hashes,
	suggestions,
	getHashQueue,
	now = Date.now,
}) {
	async function dropRemovedItems(idPlugin, catalog) {
		const removed = await hashes.deleteMissing({
			idPlugin,
			keepIds: catalog.map((item) => String(item.id)),
		});
		await suggestions.deletePendingByItems({
			idPlugin,
			idMangaPlugins: removed,
		});
		return removed;
	}

	async function enqueueMissingHashes(idPlugin, catalog) {
		const rows = new Map(
			(await hashes.listByPlugin({ idPlugin })).map((row) => [
				row.idMangaPlugin,
				row,
			]),
		);
		const pending = catalog.filter((item) =>
			needsHash(item, rows.get(String(item.id)) ?? null, now()),
		);
		const queue = getHashQueue(idPlugin);
		for (const item of pending) {
			const idMangaPlugin = String(item.id);
			await queue.add(
				'hashCover',
				{ idPlugin, idMangaPlugin, coverUrl: item.coverUrl },
				{ jobId: hashJobId(idPlugin, idMangaPlugin) },
			);
		}
		return pending.length;
	}

	async function syncConnector(idPlugin) {
		const catalog = await loadCatalog(idPlugin);
		if (!catalog) return { enqueued: 0, removed: 0 };
		const removed = await dropRemovedItems(idPlugin, catalog);
		const enqueued = await enqueueMissingHashes(idPlugin, catalog);
		return { enqueued, removed: removed.length };
	}

	async function syncAll(connectorIds) {
		for (const idPlugin of connectorIds) await syncConnector(idPlugin);
	}

	return { syncConnector, syncAll };
}

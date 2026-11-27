import KavitaClient from '../../infra/kavitaClient.js';
import logger from '../../infra/logger.js';
import { ensureKavitaConnection } from './connection.js';
import { findMatchingSeries } from './matchTitle.js';

const FAILED_STATUS = 'chapter_fix_kavita_scan_failed';

async function scanMatchingSeries({ title, kavita, log }) {
	const token = await ensureKavitaConnection({
		statusPrefix: 'chapter_fix_kavita',
		kavita,
		log,
	});
	if (!token) return { scanned: false, reason: 'connection_failed' };
	const seriesList = await kavita.searchSeries({ title, token });
	const series = findMatchingSeries({ title, seriesList });
	if (!series) return { scanned: false, reason: 'series_not_found' };
	await kavita.scanSeries({
		libraryId: series.libraryId,
		seriesId: series.seriesId,
		token,
	});
	return { scanned: true };
}

/**
 * Builds a best-effort Kavita rescan: any failure becomes `false` plus a warn
 * log, never an exception (the DB change it follows must not be undone).
 * @example const scanMangaSeries = createScanMangaSeries({ kavita, log }); await scanMangaSeries({ title: 'Black Clover' }) // true
 * @param {{ kavita: object, log: object }} deps
 * @returns {(params: { title: string }) => Promise<boolean>}
 */
export function createScanMangaSeries({ kavita, log }) {
	return async function scanMangaSeries({ title }) {
		try {
			const { scanned, reason } = await scanMatchingSeries({
				title,
				kavita,
				log,
			});
			if (!scanned) log.warn({ status: FAILED_STATUS, title, reason });
			return scanned;
		} catch (error) {
			log.warn({ status: FAILED_STATUS, title, reason: error.message });
			return false;
		}
	};
}

const scanMangaSeries = createScanMangaSeries({
	kavita: KavitaClient,
	log: logger,
});
export default scanMangaSeries;

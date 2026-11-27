import KavitaClient from '../../infra/kavitaClient.js';
import logger from '../../infra/logger.js';

/**
 * Health-checks and authenticates against Kavita. On failure logs a warn with
 * `<statusPrefix>_aborted` (so each caller keeps its own log status) and
 * returns null.
 * @example const token = await ensureKavitaConnection({ statusPrefix: 'kavita_cleanup' })
 * @param {{ statusPrefix: string, kavita?: object, log?: object }} params
 * @returns {Promise<string|null>} auth token, or null when unreachable
 */
export async function ensureKavitaConnection({
	statusPrefix,
	kavita = KavitaClient,
	log = logger,
}) {
	const status = `${statusPrefix}_aborted`;
	if (!(await kavita.checkHealth())) {
		log.warn({ status, reason: 'health_check_failed' });
		return null;
	}
	const token = await kavita.authenticate();
	if (!token) {
		log.warn({ status, reason: 'authenticate_failed' });
		return null;
	}
	return token;
}

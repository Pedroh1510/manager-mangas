import { availableParallelism } from 'node:os';
import { config } from 'dotenv';

const CONFIG_ENV = {};
export default CONFIG_ENV;
CONFIG_ENV.ENV = process.env.ENV ?? process.env.NODE_ENV;
if (!process.env.runDocker && CONFIG_ENV.ENV === 'test') {
	// config({ path: '.env.prod' });
	config({ path: '.env.development' });
}

CONFIG_ENV.DATABASE_URL = process.env.DATABASE_URL;
CONFIG_ENV.POSTGRES_HOST = process.env.POSTGRES_HOST;
CONFIG_ENV.POSTGRES_PORT = process.env.POSTGRES_PORT;
CONFIG_ENV.POSTGRES_DB = process.env.POSTGRES_DB;
CONFIG_ENV.POSTGRES_USER = process.env.POSTGRES_USER;
CONFIG_ENV.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD;
CONFIG_ENV.APPLICATION_NAME = process.env.APPLICATION_NAME;
CONFIG_ENV.REDIS_HOST = process.env.REDIS_HOST;
CONFIG_ENV.REDIS_PORT = process.env.REDIS_PORT;
CONFIG_ENV.PORT = process.env.PORT ?? 3001;
CONFIG_ENV.URL = process.env.URL ?? `http://localhost:${CONFIG_ENV.PORT}`;
CONFIG_ENV.URL_DOC =
	process.env.URL_DOC ?? `http://localhost:${CONFIG_ENV.PORT}`;

CONFIG_ENV.ENABLE_JOB = !!process.env.URL_DOC ?? false;
const concurrency = Number.parseInt(process.env.CONCURRENCY);
CONFIG_ENV.CONCURRENCY = Number.isNaN(concurrency) ? 1 : concurrency;

CONFIG_ENV.KAVITA_URL = process.env.KAVITA_URL;
CONFIG_ENV.KAVITA_API_KEY = process.env.KAVITA_API_KEY;

/**
 * Conversion stays on unless the operator writes exactly `false`.
 * @example parseImageConversionEnabled('false') // false
 * @param {string | undefined} value
 * @returns {boolean}
 */
export function parseImageConversionEnabled(value) {
	return value !== 'false';
}

/**
 * Positive integer from the env, else every core but one (minimum 1), leaving
 * a core for the event loop, Redis and Postgres clients.
 * @example parseImageConversionConcurrency(undefined, 8) // 7
 * @param {string | undefined} value
 * @param {number} cores
 * @returns {number}
 */
export function parseImageConversionConcurrency(value, cores) {
	const parsed = Number(value);
	if (Number.isInteger(parsed) && parsed >= 1) return parsed;
	return Math.max(1, cores - 1);
}

CONFIG_ENV.IMAGE_CONVERSION_ENABLED = parseImageConversionEnabled(
	process.env.IMAGE_CONVERSION_ENABLED,
);
CONFIG_ENV.IMAGE_CONVERSION_CONCURRENCY = parseImageConversionConcurrency(
	process.env.IMAGE_CONVERSION_CONCURRENCY,
	availableParallelism(),
);

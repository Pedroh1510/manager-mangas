import CONFIG_ENV from '../infra/env.js';
import { createConcurrencyLimiter } from './concurrencyLimiter.js';

/**
 * Per-domain concurrency limits. Empty by default (falls back to
 * CONFIG_ENV.CONCURRENCY). Add an entry here when a specific domain needs
 * a stricter cap, e.g. { 'https://example.com': 1 }.
 */
const CONCURRENCY_BY_DOMAIN = {};

const limitersByDomain = new Map();

function getDomain(url) {
	return new URL(url).origin;
}

function getMaxConcurrency(domain) {
	return CONCURRENCY_BY_DOMAIN[domain] ?? CONFIG_ENV.CONCURRENCY;
}

function getDomainLimiter(domain) {
	if (!limitersByDomain.has(domain)) {
		limitersByDomain.set(
			domain,
			createConcurrencyLimiter(getMaxConcurrency(domain)),
		);
	}
	return limitersByDomain.get(domain);
}

/**
 * Runs `task` once a concurrency slot for `url`'s domain is free, releasing
 * the slot afterwards regardless of success or failure.
 */
export function withDomainSlot(url, task) {
	return getDomainLimiter(getDomain(url))(task);
}

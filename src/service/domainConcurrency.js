import { setTimeout } from 'node:timers/promises';
import CONFIG_ENV from '../infra/env.js';

const POLL_INTERVAL_MS = 100;

/**
 * Per-domain concurrency limits. Empty by default (falls back to
 * CONFIG_ENV.CONCURRENCY). Add an entry here when a specific domain needs
 * a stricter cap, e.g. { 'https://example.com': 1 }.
 */
const CONCURRENCY_BY_DOMAIN = {};

const activeSlotsByDomain = {};

function getDomain(url) {
	return new URL(url).origin;
}

function getMaxConcurrency(domain) {
	return CONCURRENCY_BY_DOMAIN[domain] ?? CONFIG_ENV.CONCURRENCY;
}

async function acquireDomainSlot(domain) {
	const max = getMaxConcurrency(domain);
	while ((activeSlotsByDomain[domain] ?? 0) >= max) {
		await setTimeout(POLL_INTERVAL_MS);
	}
	activeSlotsByDomain[domain] = (activeSlotsByDomain[domain] ?? 0) + 1;
}

function releaseDomainSlot(domain) {
	activeSlotsByDomain[domain] = Math.max(
		(activeSlotsByDomain[domain] ?? 1) - 1,
		0,
	);
}

/**
 * Runs `task` once a concurrency slot for `url`'s domain is free, releasing
 * the slot afterwards regardless of success or failure.
 */
export async function withDomainSlot(url, task) {
	const domain = getDomain(url);
	await acquireDomainSlot(domain);
	try {
		return await task();
	} finally {
		releaseDomainSlot(domain);
	}
}

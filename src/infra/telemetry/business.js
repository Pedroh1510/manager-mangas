import { metrics } from '@opentelemetry/api';

// app-observability door 2: the manager-mangas pipeline counters
export const PIPELINE_EVENTS = [
	'mangas.chapters.discovered',
	'mangas.chapters.downloaded',
	'mangas.images.processed',
	'mangas.covers.hashed',
];

const counters = new Map();

function counter(name) {
	if (!counters.has(name)) {
		counters.set(name, metrics.getMeter('manager-mangas').createCounter(name));
	}
	return counters.get(name);
}

/**
 * Counts one pipeline event. `source` is the connector id (closed domain,
 * never a manga title or id) and `result` is ok | fail.
 * @example countPipelineEvent('mangas.chapters.downloaded', { source: 'mangeek', result: 'ok' })
 * @param {string} name one of PIPELINE_EVENTS
 * @param {{ source: string, result: 'ok' | 'fail' }} attributes
 */
export function countPipelineEvent(name, { source, result }) {
	if (!PIPELINE_EVENTS.includes(name)) return;
	counter(name).add(1, { source, result });
}

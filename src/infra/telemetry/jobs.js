import { metrics } from '@opentelemetry/api';
import { BullMQOtel } from 'bullmq-otel';
import logger from '../logger.js';

const METER_NAME = 'manager-mangas';
const QUEUE_STATES = ['waiting', 'delayed', 'active', 'failed'];
// BullMQ wraps its internal loop (getNextJob blocks up to drainDelay, 5s) in
// spans too; only these become spans, or the slow-trace policy keeps them all
const TRACED_OPERATIONS = new Set(['add', 'addBulk', 'process']);

class UntracedSpan {
	setSpanOnContext(ctx) {
		return ctx;
	}
	setAttribute() {}
	setAttributes() {}
	addEvent() {}
	recordException() {}
	end() {}
}

function createJobTelemetry() {
	const telemetry = new BullMQOtel(METER_NAME);
	const { tracer } = telemetry;
	telemetry.tracer = {
		startSpan(name, options, ctx) {
			const operation = name.split(' ')[0];
			return TRACED_OPERATIONS.has(operation)
				? tracer.startSpan(name, options, ctx)
				: new UntracedSpan();
		},
	};
	return telemetry;
}

/**
 * `telemetry` option for every Queue and Worker (plan door 4): propagates the
 * producer context into the job, so a job enqueued by a request shares its trace.
 * @example new Queue('download', { connection, telemetry: jobTelemetry })
 */
export const jobTelemetry = createJobTelemetry();

let jobDuration;
function jobDurationHistogram() {
	jobDuration ??= metrics
		.getMeter(METER_NAME)
		.createHistogram('app.job.duration', {
			unit: 's',
			description: 'Duration of one BullMQ job, by queue, job name and result',
		});
	return jobDuration;
}

/**
 * Wraps a BullMQ processor so every run records `app.job.duration` with
 * `queue`, `job.name` and `result` (ok | fail). The processor's result and
 * error pass through unchanged.
 * @example new Worker('download', withJobMetrics('download', processDownloadJob), opts)
 */
export function withJobMetrics(queueName, processor) {
	return async (job, ...rest) => {
		const startedAt = performance.now();
		let result = 'fail';
		try {
			const value = await processor(job, ...rest);
			result = 'ok';
			return value;
		} finally {
			jobDurationHistogram().record((performance.now() - startedAt) / 1000, {
				queue: queueName,
				'job.name': job.name,
				result,
			});
		}
	};
}

async function observeQueue(observer, gauges, queue, now) {
	const [counts, [oldest]] = await Promise.all([
		queue.getJobCounts(...QUEUE_STATES),
		queue.getJobs(['waiting'], 0, 0, true),
	]);
	for (const state of QUEUE_STATES) {
		observer.observe(gauges.jobs, counts[state] ?? 0, {
			queue: queue.name,
			state,
		});
	}
	const age = oldest ? Math.max(0, (now() - oldest.timestamp) / 1000) : 0;
	observer.observe(gauges.oldestAge, age, { queue: queue.name });
}

/**
 * Publishes `app.queue.jobs` per state and `app.queue.oldest_waiting_age`
 * for every queue `listQueues()` returns, read at each metric collection
 * (30s). A queue whose read fails is skipped for that collection.
 * @example registerQueueGauges(listAllQueues)
 */
export function registerQueueGauges(
	listQueues,
	{ now = Date.now, meter = metrics.getMeter(METER_NAME) } = {},
) {
	const gauges = {
		jobs: meter.createObservableGauge('app.queue.jobs', {
			description: 'Jobs in the queue, by state',
		}),
		oldestAge: meter.createObservableGauge('app.queue.oldest_waiting_age', {
			unit: 's',
			description: 'Age of the oldest waiting job; 0 when none waits',
		}),
	};
	meter.addBatchObservableCallback(
		(observer) =>
			Promise.all(
				listQueues().map((queue) =>
					observeQueue(observer, gauges, queue, now).catch((error) => {
						logger.warn({
							status: 'queue_gauge_failed',
							queue: queue.name,
							error: error.message,
						});
					}),
				),
			),
		[gauges.jobs, gauges.oldestAge],
	);
}

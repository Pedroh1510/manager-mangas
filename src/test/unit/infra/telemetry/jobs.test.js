import { context, trace } from '@opentelemetry/api';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
	createMeterProvider,
	installMeterProvider,
} from '../../../fakes/telemetry.js';

let meters;
let jobs;

beforeAll(async () => {
	meters = installMeterProvider();
	jobs = await import('../../../../infra/telemetry/jobs.js');
});

afterAll(async () => {
	await meters.uninstall();
});

function fakeQueue(name, { counts, oldest, failing = false }) {
	return {
		name,
		getJobCounts: async () => {
			if (failing) throw new Error('redis down');
			return counts;
		},
		getJobs: async () => (oldest ? [oldest] : []),
	};
}

describe('job metrics', () => {
	test('records job duration with result ok and fail', async () => {
		const okProcessor = jobs.withJobMetrics(
			'background-tasks',
			async () => 'value',
		);
		const failure = new Error('scrape broke');
		const failProcessor = jobs.withJobMetrics('background-tasks', async () => {
			throw failure;
		});

		await expect(okProcessor({ name: 'updateAllMangas' })).resolves.toBe(
			'value',
		);
		await expect(failProcessor({ name: 'updateAllMangas' })).rejects.toBe(
			failure,
		);

		const points = await meters.points('app.job.duration');
		const byResult = Object.fromEntries(
			points.map((point) => [point.attributes.result, point]),
		);
		expect(Object.keys(byResult).sort()).toEqual(['fail', 'ok']);
		for (const point of points) {
			expect(point.attributes).toEqual({
				queue: 'background-tasks',
				'job.name': 'updateAllMangas',
				result: point.attributes.result,
			});
			expect(point.value.count).toBe(1);
		}
	});
});

describe('queue gauges', () => {
	test('queue gauge reports counts per state and oldest waiting age', async () => {
		const now = 1_800_000_000_000;
		jobs.registerQueueGauges(
			() => [
				fakeQueue('download', {
					counts: { waiting: 3, delayed: 1, active: 2, failed: 4 },
					oldest: { timestamp: now - 90_000 },
				}),
				fakeQueue('connector-mangeek', {
					counts: { waiting: 0, delayed: 0, active: 0, failed: 0 },
				}),
			],
			{ now: () => now },
		);

		const counts = await meters.points('app.queue.jobs');
		const ofDownload = Object.fromEntries(
			counts
				.filter((point) => point.attributes.queue === 'download')
				.map((point) => [point.attributes.state, point.value]),
		);
		expect(ofDownload).toEqual({
			waiting: 3,
			delayed: 1,
			active: 2,
			failed: 4,
		});

		const ages = Object.fromEntries(
			(await meters.points('app.queue.oldest_waiting_age')).map((point) => [
				point.attributes.queue,
				point.value,
			]),
		);
		expect(ages).toEqual({ download: 90, 'connector-mangeek': 0 });
	});

	test('queue gauge skips a failing queue', async () => {
		const gaugeMeters = createMeterProvider();
		jobs.registerQueueGauges(
			() => [
				fakeQueue('broken', { counts: {}, failing: true }),
				fakeQueue('healthy', {
					counts: { waiting: 5, delayed: 0, active: 0, failed: 0 },
				}),
			],
			{ meter: gaugeMeters.provider.getMeter('test') },
		);

		const { errors } = await gaugeMeters.collect();
		const queues = new Set(
			(await gaugeMeters.points('app.queue.jobs')).map(
				(point) => point.attributes.queue,
			),
		);
		await gaugeMeters.shutdown();

		expect(errors).toEqual([]);
		expect([...queues]).toEqual(['healthy']);
	});
});

describe('bullmq tracing', () => {
	test('traces only add and process operations', () => {
		const ctx = context.active();
		const internal = jobs.jobTelemetry.tracer.startSpan(
			'getNextJob download',
			{},
		);
		expect(internal.setSpanOnContext(ctx)).toBe(ctx);
		internal.end();

		const consumer = jobs.jobTelemetry.tracer.startSpan('process download', {});
		expect(trace.getSpan(consumer.setSpanOnContext(ctx))).toBeDefined();
		consumer.end();
	});
});

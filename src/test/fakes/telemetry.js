import { metrics } from '@opentelemetry/api';
import {
	AggregationTemporality,
	MeterProvider,
	MetricReader,
} from '@opentelemetry/sdk-metrics';

class CollectingReader extends MetricReader {
	constructor() {
		super({
			aggregationTemporalitySelector: () => AggregationTemporality.CUMULATIVE,
		});
	}

	async onForceFlush() {}

	async onShutdown() {}
}

/**
 * An in-memory meter provider whose data points can be read back.
 * @example const meters = createMeterProvider(); meters.provider.getMeter('t');
 */
export function createMeterProvider() {
	const reader = new CollectingReader();
	const provider = new MeterProvider({ readers: [reader] });

	async function collect() {
		const { resourceMetrics, errors } = await reader.collect();
		return { resourceMetrics, errors };
	}

	return {
		provider,
		collect,
		/** Data points of one metric: [{ attributes, value }] */
		async points(name) {
			const { resourceMetrics } = await collect();
			return resourceMetrics.scopeMetrics
				.flatMap((scope) => scope.metrics)
				.filter((metric) => metric.descriptor.name === name)
				.flatMap((metric) => metric.dataPoints);
		},
		async shutdown() {
			await provider.shutdown();
		},
	};
}

/**
 * Registers an in-memory meter provider as the global one, so code that
 * calls `metrics.getMeter()` lazily records into it. Call `uninstall()` after.
 * @example const meters = installMeterProvider(); await meters.points('app.job.duration');
 */
export function installMeterProvider() {
	const meters = createMeterProvider();
	metrics.setGlobalMeterProvider(meters.provider);
	return {
		...meters,
		async uninstall() {
			await meters.shutdown();
			metrics.disable();
		},
	};
}

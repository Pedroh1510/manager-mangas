import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { setTimeout as sleep } from 'node:timers/promises';
import express from 'express';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { resolveTelemetryConfig } from '../../../../infra/telemetry/config.js';
import {
	createInstrumentations,
	isBullBoardRequest,
	startTelemetry,
} from '../../../../infra/telemetry/sdk.js';
import { installMeterProvider } from '../../../fakes/telemetry.js';

const require = createRequire(import.meta.url);

function listen(server) {
	return new Promise((resolve) =>
		server.listen(0, '127.0.0.1', () => resolve(server.address().port)),
	);
}

/** A port nothing listens on: bound once, then released. */
async function closedPort() {
	const server = createServer();
	const port = await listen(server);
	await new Promise((resolve) => server.close(resolve));
	return port;
}

describe('telemetry config', () => {
	test('resolves service name and endpoint defaults and env overrides', () => {
		expect(resolveTelemetryConfig({})).toEqual({
			serviceName: 'manager-mangas',
			endpoint: 'http://otel-collector:4318',
		});
		expect(
			resolveTelemetryConfig({
				OTEL_SERVICE_NAME: 'x',
				OTEL_EXPORTER_OTLP_ENDPOINT: 'http://y:4318',
			}),
		).toEqual({ serviceName: 'x', endpoint: 'http://y:4318' });
	});
});

describe('incoming http filter', () => {
	test.each([
		['/queues', true],
		['/queues/api/queues?page=1', true],
		['/queues-summary', false],
		['/status', false],
		[undefined, false],
	])('only bull-board requests are untraced: %s', (url, expected) => {
		expect(isBullBoardRequest(url)).toBe(expected);
	});
});

describe('express instrumentation', () => {
	test('express middleware layers are not traced', () => {
		const express = createInstrumentations().find(
			(instrumentation) =>
				instrumentation.instrumentationName ===
				'@opentelemetry/instrumentation-express',
		);

		expect(express.getConfig().ignoreLayersType).toEqual(['middleware']);
	});
});

describe('outgoing http instrumentation', () => {
	let meters;
	let httpInstrumentation;

	beforeAll(() => {
		meters = installMeterProvider();
		httpInstrumentation = createInstrumentations().find(
			(instrumentation) =>
				instrumentation.instrumentationName ===
				'@opentelemetry/instrumentation-http',
		);
		httpInstrumentation.setMeterProvider(meters.provider);
		httpInstrumentation.enable();
	});

	afterAll(async () => {
		httpInstrumentation.disable();
		await meters.uninstall();
	});

	test('outgoing http failures carry status or error.type', async () => {
		const http = require('node:http');
		const server = http.createServer((_req, res) => {
			res.statusCode = 503;
			res.end();
		});
		const port = await listen(server);
		const get = (target) =>
			new Promise((resolve) => {
				http
					.get(`http://127.0.0.1:${target}/`, (res) => {
						res.resume();
						res.on('end', resolve);
					})
					.on('error', resolve);
			});

		await get(port);
		await get(await closedPort());
		await new Promise((resolve) => server.close(resolve));

		const points = await meters.points('http.client.request.duration');
		const unavailable = points.find(
			(point) => point.attributes['http.response.status_code'] === 503,
		);
		// semconv also sets error.type on a 5xx, so the refused call is the one with no status
		const refused = points.find(
			(point) => point.attributes['http.response.status_code'] === undefined,
		);
		expect(unavailable?.attributes['server.address']).toBe('127.0.0.1');
		expect(refused?.attributes['error.type']).toBeDefined();
	});
});

describe('collector unreachable', () => {
	test('app keeps serving while collector is unreachable', async () => {
		const failures = [];
		const onFailure = (error) => failures.push(error);
		process.on('unhandledRejection', onFailure);
		process.on('uncaughtException', onFailure);

		const sdk = startTelemetry(
			{
				serviceName: 'manager-mangas',
				endpoint: `http://127.0.0.1:${await closedPort()}`,
			},
			{ exportIntervalMillis: 500 },
		);
		const { withJobMetrics } = await import(
			'../../../../infra/telemetry/jobs.js'
		);

		const app = express();
		app.get('/ping', (_req, res) => res.status(200).send('pong'));
		const server = app.listen(0, '127.0.0.1');
		await new Promise((resolve) => server.once('listening', resolve));
		const response = await fetch(
			`http://127.0.0.1:${server.address().port}/ping`,
		);
		const jobResult = await withJobMetrics(
			'download',
			async () => 'done',
		)({ name: 'probe' });

		await sleep(10_000);
		server.close();
		await sdk.shutdown().catch(() => {});
		process.off('unhandledRejection', onFailure);
		process.off('uncaughtException', onFailure);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe('pong');
		expect(jobResult).toBe('done');
		expect(failures).toEqual([]);
	});
});

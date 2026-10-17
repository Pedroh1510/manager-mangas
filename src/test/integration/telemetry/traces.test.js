import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import retry from 'async-retry';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import orchestrator from '../../orchestrator.js';

// The app runs for real (node --import, Postgres and Redis from the dev
// compose) and exports to a capture server here: no collector, no sampling,
// so the joins below are deterministic (app-observability C25, C28, C37).
const ROUTE = '/mangas/adm/update-mangas';
const SPAN_KIND = { server: 2, client: 3, consumer: 5 };
const WAIT_MS = 60_000;

let capture;
let app;
let baseUrl;
const spans = [];
const stdoutLines = [];

function attributes(span) {
	return Object.fromEntries(
		(span.attributes ?? []).map(({ key, value }) => [
			key,
			value.stringValue ?? value.intValue ?? value.boolValue,
		]),
	);
}

function startCapture() {
	const server = createServer((req, res) => {
		let body = '';
		req.on('data', (chunk) => {
			body += chunk;
		});
		req.on('end', () => {
			if (req.url === '/v1/traces') {
				for (const resourceSpans of JSON.parse(body).resourceSpans ?? []) {
					for (const scopeSpans of resourceSpans.scopeSpans ?? []) {
						spans.push(...scopeSpans.spans);
					}
				}
			}
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end('{}');
		});
	});
	return new Promise((resolve) =>
		server.listen(0, '127.0.0.1', () => resolve(server)),
	);
}

async function freePort() {
	const server = createServer();
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address();
	await new Promise((resolve) => server.close(resolve));
	return port;
}

function startApp(port, otlpEndpoint) {
	const child = spawn(
		'node',
		['--import', './src/telemetry.js', 'src/server.js'],
		{
			env: {
				...process.env,
				ENV: 'test',
				PORT: `${port}`,
				URL_DOC: 'telemetry-test',
				OTEL_EXPORTER_OTLP_ENDPOINT: otlpEndpoint,
			},
			stdio: ['ignore', 'pipe', 'inherit'],
		},
	);
	let pending = '';
	child.stdout.on('data', (chunk) => {
		const lines = (pending + chunk).split('\n');
		pending = lines.pop();
		stdoutLines.push(...lines);
	});
	return child;
}

const serverSpanOfRoute = () =>
	spans.find(
		(span) =>
			span.kind === SPAN_KIND.server &&
			attributes(span)['http.route'] === ROUTE,
	);

const spansOfTrace = (traceId) =>
	spans.filter((span) => span.traceId === traceId);

const isJobSpan = (span) =>
	span.kind === SPAN_KIND.consumer &&
	span.name.startsWith('process background-tasks');

function jobLogLines(traceId) {
	return stdoutLines
		.map((line) => {
			try {
				return JSON.parse(line);
			} catch {
				return null;
			}
		})
		.filter(
			(line) =>
				line?.trace_id === traceId &&
				line.msg?.status === 'updateMangaChapters',
		);
}

let traceId;

beforeAll(async () => {
	capture = await startCapture();
	const port = await freePort();
	baseUrl = `http://127.0.0.1:${port}`;
	app = startApp(port, `http://127.0.0.1:${capture.address().port}`);
	await retry(
		async () => {
			const response = await fetch(`${baseUrl}/status`);
			if (response.status !== 200) throw new Error(`status ${response.status}`);
		},
		{ retries: 100, minTimeout: 200, maxTimeout: 1000 },
	);
	await orchestrator.clearDatabase();
	await fetch(`${baseUrl}/migrations`, { method: 'POST' });
	await orchestrator.seedDatabase();

	const response = await fetch(`${baseUrl}${ROUTE}?idPlugin=test-fixture`);
	expect(response.status).toBe(200);

	// spans are batched every 5 s and the job runs after the response
	await retry(
		async () => {
			traceId = serverSpanOfRoute()?.traceId;
			if (!traceId) throw new Error('request span not exported yet');
			if (!spansOfTrace(traceId).some(isJobSpan)) {
				throw new Error('job span not exported yet');
			}
			if (!jobLogLines(traceId).length) throw new Error('job log not seen yet');
		},
		{ retries: WAIT_MS / 1000, minTimeout: 1000, maxTimeout: 1000, factor: 1 },
	).catch(() => {});
}, WAIT_MS + 60_000);

afterAll(async () => {
	app?.kill('SIGTERM');
	await new Promise((resolve) => capture?.close(resolve));
});

describe('trace join on a real request', () => {
	test('a nested router request keeps its http.route', () => {
		expect(serverSpanOfRoute()?.name).toBe(`GET ${ROUTE}`);
	});

	test('request trace joins http db and redis spans', () => {
		expect(traceId).toBeDefined();
		const systems = spansOfTrace(traceId)
			.filter((span) => span.kind === SPAN_KIND.client)
			.map(
				(span) =>
					attributes(span)['db.system.name'] ?? attributes(span)['db.system'],
			);
		expect(systems).toContain('postgresql');
		expect(systems).toContain('redis');
	});

	test('job enqueued by a request shares its trace', () => {
		expect(traceId).toBeDefined();
		expect(spansOfTrace(traceId).filter(isJobSpan)).not.toHaveLength(0);
	});

	test('job log line carries the request trace_id', () => {
		expect(traceId).toBeDefined();
		expect(jobLogLines(traceId)).not.toHaveLength(0);
	});
});

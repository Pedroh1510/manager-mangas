import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from 'vitest';
import winston from 'winston';

vi.mock('stack-trace', async (importOriginal) => {
	const actual = await importOriginal();
	return { ...actual, get: vi.fn((...args) => actual.get(...args)) };
});

const logger = (await import('../../../infra/logger.js')).default;
const stackTrace = await import('stack-trace');

class CapturedOutputStream extends Writable {
	lines = [];

	_write(chunk, _encoding, callback) {
		this.lines.push(chunk.toString());
		callback();
	}
}

describe('logger', () => {
	let output;
	let transport;
	const lastLine = () => JSON.parse(output.lines.at(-1));

	beforeEach(() => {
		output = new CapturedOutputStream();
		transport = new winston.transports.Stream({ stream: output });
		logger.logger.add(transport);
	});

	afterEach(() => {
		logger.logger.remove(transport);
	});

	test('every line is one json object with level msg and time', () => {
		logger.info('catalog refreshed');

		expect(output.lines.at(-1).trim().split('\n')).toHaveLength(1);
		const line = lastLine();
		expect(line.level).toBe('info');
		expect(line.msg).toBe('catalog refreshed');
		expect(new Date(line.time).toISOString()).toBe(line.time);
	});

	test('an object message is kept as json fields', () => {
		logger.info({ idManga: 7, status: 'updateMangaChapters' });

		expect(lastLine().msg).toEqual({
			idManga: 7,
			status: 'updateMangaChapters',
		});
	});

	test('error appends the metadata object as JSON', () => {
		logger.error('catalog refresh enqueue failed', {
			connectorId: 'fake',
			error: 'redis down',
		});

		const line = lastLine();
		expect(line.msg).toBe('catalog refresh enqueue failed');
		expect(line.meta).toEqual({ connectorId: 'fake', error: 'redis down' });
	});

	test('error without metadata keeps the message-only line', () => {
		logger.error('plain message');

		const line = lastLine();
		expect(line.msg).toBe('plain message');
		expect(line).not.toHaveProperty('meta');
	});

	test('does not capture a stack trace below error', () => {
		stackTrace.get.mockClear();

		logger.info('info line');
		logger.warn('warn line');
		logger.debug('debug line');
		logger.http('http line');

		expect(output.lines).toHaveLength(4);
		expect(stackTrace.get).not.toHaveBeenCalled();
	});

	test('error captures the caller location once', () => {
		stackTrace.get.mockClear();

		logger.error('located failure');

		expect(stackTrace.get).toHaveBeenCalledTimes(1);
		expect(lastLine().location).toMatch(/logger\.test\.js:\d+$/);
	});

	test('error location names the calling function', () => {
		function reportChapterFailure() {
			logger.error('chapter failed');
		}

		reportChapterFailure();

		expect(lastLine().location).toMatch(/logger\.test\.js:\d+$/);
		expect(lastLine().function).toBe('reportChapterFailure');
	});

	describe('trace context', () => {
		let provider;

		beforeAll(() => {
			provider = new NodeTracerProvider();
			provider.register();
		});

		afterAll(async () => {
			await provider.shutdown();
			trace.disable();
		});

		test('log line carries active span ids', () => {
			const tracer = trace.getTracer('logger-test');
			let spanContext;
			tracer.startActiveSpan('job', (span) => {
				spanContext = span.spanContext();
				logger.info('inside span');
				span.end();
			});
			const inside = lastLine();
			logger.info('outside span');
			const outside = lastLine();

			expect(inside.trace_id).toBe(spanContext.traceId);
			expect(inside.span_id).toBe(spanContext.spanId);
			expect(outside).not.toHaveProperty('trace_id');
			expect(outside).not.toHaveProperty('span_id');
		});
	});
});

describe('logging surface', () => {
	const srcDir = join(import.meta.dirname, '../../..');

	function sourceFiles(dir) {
		return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
			const path = join(dir, entry.name);
			if (entry.isDirectory())
				return entry.name === 'test' ? [] : sourceFiles(path);
			return entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')
				? [path]
				: [];
		});
	}

	test('no morgan and no console calls outside the logger', () => {
		const pkg = JSON.parse(
			readFileSync(join(srcDir, '../package.json'), 'utf8'),
		);
		expect(pkg.dependencies).not.toHaveProperty('morgan');
		expect(pkg.devDependencies ?? {}).not.toHaveProperty('morgan');

		const offenders = sourceFiles(srcDir)
			.filter((file) => !file.endsWith(join('infra', 'logger.js')))
			.flatMap((file) =>
				readFileSync(file, 'utf8')
					.split('\n')
					.map((line, index) => ({ file, line: index + 1, text: line }))
					.filter(({ text }) => /console\.(log|error)\(/.test(text)),
			)
			.map(({ file, line }) => `${file}:${line}`);
		expect(offenders).toEqual([]);
	});
});

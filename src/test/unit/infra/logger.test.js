import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
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

	beforeEach(() => {
		output = new CapturedOutputStream();
		transport = new winston.transports.Stream({ stream: output });
		logger.logger.add(transport);
	});

	afterEach(() => {
		logger.logger.remove(transport);
	});

	test('error appends the metadata object as JSON', () => {
		logger.error('catalog refresh enqueue failed', {
			connectorId: 'fake',
			error: 'redis down',
		});

		const line = output.lines.at(-1);
		expect(line).toContain('catalog refresh enqueue failed');
		expect(line).toContain('{"connectorId":"fake","error":"redis down"}');
	});

	test('error without metadata keeps the message-only line', () => {
		logger.error('plain message');

		const line = output.lines.at(-1);
		expect(line).toContain('plain message');
		expect(line).not.toContain('{');
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
		expect(output.lines.at(-1)).toMatch(/\[[^\]]*logger\.test\.js:\d+\]/);
	});

	test('error location names the calling function', () => {
		function reportChapterFailure() {
			logger.error('chapter failed');
		}

		reportChapterFailure();

		expect(output.lines.at(-1)).toMatch(
			/\[[^\]]*logger\.test\.js:\d+\] \[reportChapterFailure\]/,
		);
	});
});

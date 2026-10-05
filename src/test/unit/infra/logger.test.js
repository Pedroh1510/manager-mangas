import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import winston from 'winston';
import logger from '../../../infra/logger.js';

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
});

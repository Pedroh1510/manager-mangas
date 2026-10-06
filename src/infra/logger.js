import { setTimeout } from 'node:timers/promises';
import * as stack from 'stack-trace';
import winston from 'winston';

const { combine, timestamp, printf, colorize, align, errors, metadata } =
	winston.format;
const LOGGER_FILE = '/infra/logger.js';

// Capturing a stack is the costly part of a log line, so it runs once and
// only for errors. The caller is the frame right after the last logger frame.
const getTrace = () => {
	const frames = stack.get();
	const lastLoggerFrame = frames.findLastIndex((frame) =>
		frame.getFileName()?.includes(LOGGER_FILE),
	);
	const caller = frames[lastLoggerFrame + 1];
	if (lastLoggerFrame === -1 || !caller) return {};
	return {
		fileName: caller.getFileName(),
		functionName: caller.getFunctionName(),
		line: caller.getLineNumber(),
	};
};

function formatLocation(info) {
	if (info[Symbol.for('level')] !== 'error') return '';
	const { fileName, functionName, line } = getTrace();
	return ` [${fileName}:${line}] [${functionName}]`;
}

const formatLog = () =>
	combine(
		errors({ stack: true }),
		colorize({ all: true }),
		timestamp({
			format: 'DD/MM/YYYY HH:mm:ss.SSS ',
		}),
		align(),
		printf((info) => {
			const meta = info.meta ? ` ${JSON.stringify(info.meta)}` : '';
			return `[${info.timestamp}]${formatLocation(info)} ${info.level}: ${info.message}${meta}`;
		}),
	);

class Logger {
	logger = winston.createLogger({
		format: formatLog(),
		level: 'debug',
		transports: [new winston.transports.Console()],
	});

	info(message) {
		this.logger.info(message);
	}

	error(message, meta) {
		if (!meta) {
			this.logger.error(message);
			return;
		}
		this.logger.error(message, { meta });
	}

	warn(message) {
		this.logger.warn(message);
	}

	debug(message) {
		const messageFormatted =
			typeof message === 'object' ? JSON.stringify(message, null, 2) : message;
		this.logger.debug(messageFormatted);
	}

	http(message) {
		this.logger.http(message);
	}

	async close() {
		this.logger.close();
		await setTimeout(1000);
	}
}
const logger = new Logger();
export default logger;

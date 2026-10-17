import { setTimeout } from 'node:timers/promises';
import { isSpanContextValid, trace } from '@opentelemetry/api';
import * as stack from 'stack-trace';
import winston from 'winston';

const { combine, printf, errors } = winston.format;
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
		location: `${caller.getFileName()}:${caller.getLineNumber()}`,
		function: caller.getFunctionName(),
	};
};

// app-observability door 3: the collector copies trace_id/span_id into the
// log record, linking the line to its trace
function activeSpanIds() {
	const spanContext = trace.getActiveSpan()?.spanContext();
	if (!spanContext || !isSpanContextValid(spanContext)) return {};
	return { trace_id: spanContext.traceId, span_id: spanContext.spanId };
}

// One JSON object per line: level, msg, time, then the optional fields
const formatLog = () =>
	combine(
		errors({ stack: true }),
		printf((info) =>
			JSON.stringify({
				level: info.level,
				msg: info.message,
				time: new Date().toISOString(),
				...(info.meta ? { meta: info.meta } : {}),
				...(info.stack ? { stack: info.stack } : {}),
				...(info.location
					? { location: info.location, function: info.function }
					: {}),
				...(info.trace_id
					? { trace_id: info.trace_id, span_id: info.span_id }
					: {}),
			}),
		),
	);

class Logger {
	logger = winston.createLogger({
		format: formatLog(),
		level: 'debug',
		transports: [new winston.transports.Console()],
	});

	#log(level, message, fields = {}) {
		this.logger.log({ level, message, ...fields, ...activeSpanIds() });
	}

	info(message) {
		this.#log('info', message);
	}

	error(message, meta) {
		const location = getTrace();
		if (!meta) {
			this.#log('error', message, location);
			return;
		}
		this.#log('error', message, { meta, ...location });
	}

	warn(message) {
		this.#log('warn', message);
	}

	debug(message) {
		const messageFormatted =
			typeof message === 'object' ? JSON.stringify(message, null, 2) : message;
		this.#log('debug', messageFormatted);
	}

	http(message) {
		this.#log('http', message);
	}

	async close() {
		this.logger.close();
		await setTimeout(1000);
	}
}
const logger = new Logger();
export default logger;

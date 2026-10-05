import { setTimeout } from 'node:timers/promises';
import * as stack from 'stack-trace';
import winston from 'winston';

const { combine, timestamp, printf, colorize, align, errors, metadata } =
	winston.format;
const getTrace = () => {
	let isAfterLogger = false;
	const aaaa = stack
		.get()
		.slice(2)
		.map((item) => item.getFileName());
	const fileProps = stack
		.get()
		.slice(2)
		.find((item) => {
			const file = item.getFileName();
			if (item.getFileName().includes('/infra/logger.js')) {
				isAfterLogger = true;
				return false;
			}
			return isAfterLogger;
		});
	if (!fileProps) return {};
	return {
		fileName: fileProps.getFileName(),
		functionName: fileProps.getFunctionName(),
		line: fileProps.getLineNumber(),
	};
};
const formatLog = () =>
	combine(
		errors({ stack: true }),
		colorize({ all: true }),
		timestamp({
			format: 'DD/MM/YYYY HH:mm:ss.SSS ',
		}),
		align(),
		printf((info) => {
			const { fileName, functionName, line } = getTrace();
			const meta = info.meta ? ` ${JSON.stringify(info.meta)}` : '';
			return `[${info.timestamp}] [${fileName}:${line}] [${functionName}] ${info.level}: ${info.message}${meta}`;
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

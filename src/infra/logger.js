import { setTimeout } from 'node:timers/promises';
import winston from 'winston';

const { combine, timestamp, printf, colorize, align, errors } = winston.format;

const formatLog = () =>
	combine(
		errors({ stack: true }),
		colorize({ all: true }),
		timestamp({
			format: 'DD/MM/YYYY HH:mm:ss.SSS '
		}),
		align(),
		printf((info) => `[${info.timestamp}] ${info.level}: ${info.message}`)
	);

class Logger {
	logger = winston.createLogger({
		format: formatLog(),
		level: 'debug',
		transports: [new winston.transports.Console()]
	});

	info(message) {
		this.logger.info(message);
	}

	error(message) {
		this.logger.error(message);
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

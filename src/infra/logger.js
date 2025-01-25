import winston from 'winston';

const { combine, timestamp, printf, colorize, align, errors } = winston.format;

const formatLog = () =>
	combine(
		errors({ stack: true }),
		colorize({ all: true }),
		timestamp({
			format: 'DD/MM/YYYY HH:mm:ss.SSS ',
		}),
		align(),
		printf((info) => `[${info.timestamp}] ${info.level}: ${info.message}`),
	);

const logger = winston.createLogger({
	format: formatLog(),
	level: 'debug',
	transports: [new winston.transports.Console()],
});
export default logger;

import winston from 'winston';
// import LokiTransport from 'winston-loki'

// import CONFIG from '../infra/config.js'
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

// const makeTransportLoki = () => {
//   try {
//     return new LokiTransport({
//       host: CONFIG.loki,
//       batching: false,
//       gracefulShutdown: true,
//       format: formatLog(),
//       replaceTimestamp: true,
//       labels: {
//         job: 'rss',
//       },
//     })
//   } catch {
//     return new winston.transports.Console()
//   }
// }

const logger = winston.createLogger({
	format: formatLog(),
	level: 'debug',
	transports: [new winston.transports.Console()]
});
export default logger;

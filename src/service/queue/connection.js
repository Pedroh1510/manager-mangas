import CONFIG_ENV from '../../infra/env.js';

const connection = {
	host: CONFIG_ENV.REDIS_HOST,
	port: CONFIG_ENV.REDIS_PORT,
};

export default connection;

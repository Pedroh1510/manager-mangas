import { config } from 'dotenv';

const CONFIG_ENV = {};
export default CONFIG_ENV;
CONFIG_ENV.ENV = process.env.ENV ?? process.env.NODE_ENV;
if (!process.env.runDocker && CONFIG_ENV.ENV === 'test') {
	config({ path: '.env.development' });
}

CONFIG_ENV.DATABASE_URL = process.env.DATABASE_URL;
CONFIG_ENV.POSTGRES_HOST = process.env.POSTGRES_HOST;
CONFIG_ENV.POSTGRES_PORT = process.env.POSTGRES_PORT;
CONFIG_ENV.POSTGRES_DB = process.env.POSTGRES_DB;
CONFIG_ENV.POSTGRES_USER = process.env.POSTGRES_USER;
CONFIG_ENV.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD;
CONFIG_ENV.APPLICATION_NAME = process.env.APPLICATION_NAME;
CONFIG_ENV.REDIS_HOST = process.env.REDIS_HOST;
CONFIG_ENV.REDIS_PORT = process.env.REDIS_PORT;
CONFIG_ENV.PORT = process.env.PORT ?? 3001;
CONFIG_ENV.URL = process.env.URL ?? `http://localhost:${CONFIG_ENV.PORT}`;
CONFIG_ENV.URL_DOC =
	process.env.URL_DOC ?? `http://localhost:${CONFIG_ENV.PORT}`;

CONFIG_ENV.ENABLE_JOB = !!process.env.URL_DOC ?? false;

// Loaded with `node --import ./src/telemetry.js` (app-observability door 5),
// so the SDK patches express, pg and ioredis before the app imports them.
import { register } from 'node:module';
import { resolveTelemetryConfig } from './infra/telemetry/config.js';
import { startTelemetry } from './infra/telemetry/sdk.js';

// express, pg and ioredis are CommonJS imported from ESM: the hook lets the
// instrumentations patch them on import
register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

const sdk = startTelemetry(resolveTelemetryConfig(process.env));

process.once('beforeExit', () => {
	sdk.shutdown().catch(() => {});
});

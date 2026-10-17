// app-observability Q25: defaults live in the code, so a Coolify deploy
// needs no extra env; the env still overrides both.
export const SERVICE_NAME = 'manager-mangas';
export const DEFAULT_OTLP_ENDPOINT = 'http://otel-collector:4318';

/**
 * Service name and OTLP base endpoint (no trailing slash) for the SDK.
 * @example resolveTelemetryConfig({}) // { serviceName: 'manager-mangas', endpoint: 'http://otel-collector:4318' }
 * @param {Record<string, string | undefined>} env
 */
export function resolveTelemetryConfig(env) {
	return {
		serviceName: env.OTEL_SERVICE_NAME || SERVICE_NAME,
		endpoint: (
			env.OTEL_EXPORTER_OTLP_ENDPOINT || DEFAULT_OTLP_ENDPOINT
		).replace(/\/+$/, ''),
	};
}

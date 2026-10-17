import CONFIG_ENV from '../../../../../infra/env.js';

/**
 * fetch against the test API, returning `{ status, body }`.
 * @example const { status, body } = await call('GET', '/mangas/adm/suggestions');
 */
export async function call(method, route) {
	const response = await fetch(`${CONFIG_ENV.URL}${route}`, { method });
	const text = await response.text();
	return { status: response.status, body: text ? JSON.parse(text) : null };
}

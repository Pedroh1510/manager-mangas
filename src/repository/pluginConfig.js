// Site access settings per connector, on the same pluginConfig row as the
// switch. idPlugin matches case-insensitively, like connectorSwitches.js.
import sql from 'sql-bricks-postgres';
import database from '../infra/database.js';

/**
 * Cookie and user agent a connector's downloads must send.
 * @example await findPluginAccess({ idPlugin: 'nexustoons' }) // { cookie: 'c=1', userAgent: null }
 * @param {{ idPlugin: string }} params
 * @returns {Promise<{ cookie: string|null, userAgent: string|null }>}
 */
async function findPluginAccess({ idPlugin }) {
	const { rows } = await database.query(
		sql
			.select('cookie', '"userAgent"')
			.from('pluginConfig')
			.where({ 'lower("idPlugin")': idPlugin.toLowerCase() })
			.toParams(),
	);
	return {
		cookie: rows[0]?.cookie ?? null,
		userAgent: rows[0]?.userAgent ?? null,
	};
}

const PluginConfigRepository = { findPluginAccess };

export default PluginConfigRepository;

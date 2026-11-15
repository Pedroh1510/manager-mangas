// Global on/off switch per connector, stored on its pluginConfig row
// (GLOSSARY: "Conector desligado"). idPlugin matches case-insensitively, like
// the cookie and credentials on the same row.
import sql from 'sql-bricks-postgres';
import database from '../infra/database.js';

const byPlugin = (idPlugin) => ({
	'lower("idPlugin")': idPlugin.toLowerCase(),
});

/**
 * @example await findSwitch({ idPlugin: 'wicomix' }) // { disabledAt, disabledReason } | null
 * @param {{ idPlugin: string }} params
 * @returns {Promise<{ disabledAt: Date|null, disabledReason: string|null } | null>}
 */
async function findSwitch({ idPlugin }) {
	const { rows } = await database.query(
		sql
			.select('"disabledAt"', '"disabledReason"')
			.from('pluginConfig')
			.where(byPlugin(idPlugin))
			.toParams(),
	);
	return rows[0] ?? null;
}

/**
 * Every disabled connector, lower-cased.
 * @example await listDisabled() // [{ idPlugin: 'wicomix', disabledAt, disabledReason }]
 * @returns {Promise<Array<{ idPlugin: string, disabledAt: Date, disabledReason: string|null }>>}
 */
async function listDisabled() {
	const { rows } = await database.query(
		sql
			.select(
				'lower("idPlugin") AS "idPlugin"',
				'"disabledAt"',
				'"disabledReason"',
			)
			.from('pluginConfig')
			.where(sql.isNotNull('disabledAt'))
			.toParams(),
	);
	return rows;
}

async function updateSwitch({ idPlugin, values }) {
	const { rowCount } = await database.query(
		sql.update('pluginConfig', values).where(byPlugin(idPlugin)).toParams(),
	);
	return rowCount;
}

/**
 * Turns a connector off, creating its pluginConfig row when missing. Only the
 * switch columns are written, so cookie and credentials survive.
 * @example await setDisabled({ idPlugin: 'wicomix', reason: 'paywall' })
 * @param {{ idPlugin: string, reason: string|null }} params
 */
async function setDisabled({ idPlugin, reason }) {
	const values = { disabledAt: new Date(), disabledReason: reason };
	if (await updateSwitch({ idPlugin, values })) return;
	await database.query(
		sql.insertInto('pluginConfig', { idPlugin, ...values }).toParams(),
	);
}

/**
 * @example await clearDisabled({ idPlugin: 'wicomix' })
 * @param {{ idPlugin: string }} params
 */
async function clearDisabled({ idPlugin }) {
	await updateSwitch({
		idPlugin,
		values: { disabledAt: null, disabledReason: null },
	});
}

const ConnectorSwitchesRepository = {
	findSwitch,
	listDisabled,
	setDisabled,
	clearDisabled,
};

export default ConnectorSwitchesRepository;

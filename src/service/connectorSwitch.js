// Single source of truth for "Conector desligado" (GLOSSARY): every path that
// reaches a connector's site asks here first.
import * as registry from '../connectors/registry.js';
import { ConflictError, ValidationError } from '../infra/errors.js';
import ConnectorSwitchesRepository from '../repository/connectorSwitches.js';

function assertKnownConnector(idPlugin) {
	if (registry.hasConnector(idPlugin)) return;
	throw new ValidationError({
		message: `Plugin with id ${idPlugin} not found`,
		action: `Use one of: ${registry.listConnectorIds().join(', ')}`,
	});
}

function normalizeReason(reason) {
	const trimmed = reason?.trim();
	return trimmed ? trimmed : null;
}

/**
 * @example await isConnectorEnabled('wicomix') // false
 * @param {string} idPlugin
 * @returns {Promise<boolean>}
 */
async function isConnectorEnabled(idPlugin) {
	const found = await ConnectorSwitchesRepository.findSwitch({ idPlugin });
	return !found?.disabledAt;
}

/**
 * Throws a 409 when the connector is disabled.
 * @example await assertConnectorEnabled('mangeek')
 * @param {string} idPlugin
 * @returns {Promise<void>}
 */
async function assertConnectorEnabled(idPlugin) {
	const found = await ConnectorSwitchesRepository.findSwitch({ idPlugin });
	if (!found?.disabledAt) return;
	const reason = found.disabledReason ? `: ${found.disabledReason}` : '';
	throw new ConflictError({
		message: `Connector ${idPlugin} is disabled${reason}`,
		action: 'Religue o conector em Configurações > Conectores',
	});
}

/**
 * Registry connectors minus the disabled ones.
 * @example await listEnabledConnectorIds() // ['mangeek', 'nexustoons']
 * @returns {Promise<string[]>}
 */
async function listEnabledConnectorIds() {
	const disabled = await ConnectorSwitchesRepository.listDisabled();
	const disabledIds = new Set(disabled.map((row) => row.idPlugin));
	return registry.listConnectorIds().filter((id) => !disabledIds.has(id));
}

/**
 * Turns a connector off for every manga; links keep their own isActive.
 * @example await disableConnector({ idPlugin: 'wicomix', reason: 'paywall' })
 * @param {{ idPlugin: string, reason?: string }} params
 */
async function disableConnector({ idPlugin, reason }) {
	assertKnownConnector(idPlugin);
	await ConnectorSwitchesRepository.setDisabled({
		idPlugin,
		reason: normalizeReason(reason),
	});
}

/**
 * Turns a connector back on; nothing is triggered, the next schedule picks it up.
 * @example await enableConnector({ idPlugin: 'wicomix' })
 * @param {{ idPlugin: string }} params
 */
async function enableConnector({ idPlugin }) {
	assertKnownConnector(idPlugin);
	await ConnectorSwitchesRepository.clearDisabled({ idPlugin });
}

const ConnectorSwitch = {
	isConnectorEnabled,
	assertConnectorEnabled,
	listEnabledConnectorIds,
	disableConnector,
	enableConnector,
};

export default ConnectorSwitch;

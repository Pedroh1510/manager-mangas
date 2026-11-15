// Single source of truth for "Conector desligado" (GLOSSARY): every path that
// reaches a connector's site asks here first.
import * as registry from '../connectors/registry.js';
import { ConflictError, ValidationError } from '../infra/errors.js';
import ConnectorSwitchesRepository from '../repository/connectorSwitches.js';
import MangaConnectorsRepository from '../repository/mangaConnectors.js';

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

function describeSwitch(id, disabledRow, activeLinks) {
	const ConnectorClass = registry.getConnectorClass(id);
	return {
		id,
		url: new ConnectorClass().url,
		enabled: !disabledRow,
		disabledAt: disabledRow?.disabledAt?.toISOString() ?? null,
		disabledReason: disabledRow?.disabledReason ?? null,
		activeLinks: activeLinks.get(id) ?? 0,
	};
}

/**
 * State of every registry connector for the admin list, ordered by id.
 * @example await listConnectorSwitches() // [{ id: 'wicomix', url, enabled: false, disabledAt, disabledReason, activeLinks: 3 }]
 * @returns {Promise<Array<{ id: string, url: string, enabled: boolean, disabledAt: string|null, disabledReason: string|null, activeLinks: number }>>}
 */
async function listConnectorSwitches() {
	const disabled = await ConnectorSwitchesRepository.listDisabled();
	const disabledById = new Map(disabled.map((row) => [row.idPlugin, row]));
	const activeLinks =
		await MangaConnectorsRepository.countActiveLinksByPlugin();
	return registry
		.listConnectorIds()
		.toSorted()
		.map((id) => describeSwitch(id, disabledById.get(id), activeLinks));
}

const ConnectorSwitch = {
	listConnectorSwitches,
	isConnectorEnabled,
	assertConnectorEnabled,
	listEnabledConnectorIds,
	disableConnector,
	enableConnector,
};

export default ConnectorSwitch;

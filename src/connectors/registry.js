import Mangeek from './mangeek/Mangeek.js';
import NexusMangas from './nexusmangas/NexusMangas.js';
import NexusToons from './nexustoons/NexusToons.js';

const connectors = {
	mangeek: Mangeek,
	nexustoons: NexusToons,
	nexusmangas: NexusMangas,
};

export function getConnectorClass(id) {
	const ConnectorClass = connectors[id?.toLowerCase()];
	if (!ConnectorClass) {
		throw new Error(`Connector "${id}" not found`);
	}
	return ConnectorClass;
}

export function hasConnector(id) {
	return Boolean(connectors[id?.toLowerCase()]);
}

export function listConnectorIds() {
	return Object.keys(connectors);
}

export function registerForTests(id, ConnectorClass) {
	connectors[id.toLowerCase()] = ConnectorClass;
}

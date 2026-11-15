/**
 * Thrown by a connector's catalog sweep when its shouldStop() answers true
 * (the connector was disabled mid-run). The connector queue turns it into an
 * empty success, so no partial catalog is ever saved.
 * @example throw new CatalogRefreshStoppedError('wicomix')
 */
export class CatalogRefreshStoppedError extends Error {
	/** @param {string} connectorId */
	constructor(connectorId) {
		super(`Catalog refresh of ${connectorId} stopped: connector disabled`);
		this.name = 'CatalogRefreshStoppedError';
		this.connectorId = connectorId;
	}
}

import { NotFoundError } from '../../infra/errors.js';

// Same job id as the post-refresh sync (connectorQueue.postRefreshJobs), so a
// manual request while one is queued is a no-op instead of a second run.
const connectorJobId = (idPlugin) => `sync-cover-index-${idPlugin}`;
const ALL_CONNECTORS_JOB_ID = 'sync-cover-index-all';

/**
 * Builds the on-demand sync of the cover hash index: one connector when
 * idPlugin is given, every connector otherwise.
 * @example await createCoverSyncRequest(deps)({ idPlugin: 'nexustoons' }) // { idPlugin: 'nexustoons' }
 * @param {{hasConnector: (idPlugin: string) => boolean, enqueue: (operation: string, data: object, jobId: string) => Promise<void>}} deps
 * @returns {(input: {idPlugin?: string}) => Promise<{idPlugin: string|null}>}
 */
export function createCoverSyncRequest({ hasConnector, enqueue }) {
	return async function requestCoverSync({ idPlugin }) {
		if (!idPlugin) {
			await enqueue('syncCoverHashIndex', {}, ALL_CONNECTORS_JOB_ID);
			return { idPlugin: null };
		}
		if (!hasConnector(idPlugin)) {
			throw new NotFoundError({
				message: `Plugin "${idPlugin}" not found, expected one of the registered connector ids`,
				action: 'Verifique o idPlugin em GET /mangas/plugins.',
			});
		}
		await enqueue(
			'syncConnectorCoverIndex',
			{ idPlugin },
			connectorJobId(idPlugin),
		);
		return { idPlugin };
	};
}

import { listConnectorIds } from '../../connectors/registry.js';
import { getBackgroundQueue } from './backgroundQueue.js';
import { getConnectorQueue } from './connectorQueue.js';
import { getDownloadQueue } from './downloadQueue.js';

/**
 * Every BullMQ queue this process owns: one per connector plus background and
 * download. Shared by bull-board and /queues-summary so both list the same set.
 * @example listAllQueues().map((queue) => queue.name)
 */
export function listAllQueues() {
	return [
		...listConnectorIds().map((id) => getConnectorQueue(id)),
		getBackgroundQueue(),
		getDownloadQueue(),
	];
}

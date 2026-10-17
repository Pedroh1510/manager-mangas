import path from 'node:path';
import logger from '../../infra/logger.js';
import MangaConnectorsRepository from '../../repository/mangaConnectors.js';
import { loadCatalog } from '../../utils/mangaCatalog.js';
import { withDomainSlot } from '../domainConcurrency.js';
import { createCoverDownloader } from './coverDownloader.js';
import { createCoverPaths } from './coverPaths.js';
import { createCoverService } from './coverService.js';
import { coverStore } from './coverStore.js';

// Same appdata/ folder as the catalog cache (utils/mangaCatalog.js).
const COVERS_ROOT = path.resolve('appdata');

const CoverService = createCoverService({
	paths: createCoverPaths(COVERS_ROOT),
	store: coverStore,
	downloadCover: createCoverDownloader(),
	withDomainSlot,
	loadCatalog,
	listConnectorsByManga: MangaConnectorsRepository.listConnectorsByManga,
	logger,
});

export default CoverService;

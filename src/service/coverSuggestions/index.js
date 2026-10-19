import path from 'node:path';
import { listConnectorIds } from '../../connectors/registry.js';
import CONFIG_ENV from '../../infra/env.js';
import logger from '../../infra/logger.js';
import CatalogCoverHashesRepository from '../../repository/catalogCoverHashes.js';
import CoverSuggestionsRepository from '../../repository/coverSuggestions.js';
import MangaConnectorsRepository from '../../repository/mangaConnectors.js';
import MangasRepository from '../../repository/mangas.js';
import { loadCatalog } from '../../utils/mangaCatalog.js';
import { createCoverDownloader } from '../covers/coverDownloader.js';
import { createCoverPaths } from '../covers/coverPaths.js';
import { coverStore } from '../covers/coverStore.js';
import { withDomainSlot } from '../domainConcurrency.js';
import { getCoverHashQueue } from '../queue/coverHashQueue.js';
import { createHashCoverJob } from './hashCoverJob.js';
import { hashCoverImage } from './hashing.js';
import { createIndexSync } from './indexSync.js';
import { createMangaMatchJob } from './mangaMatchJob.js';
import { createMatcher, matchConfigFrom } from './matching.js';

// Same appdata/ folder as the covers service (service/covers/index.js).
const paths = createCoverPaths(path.resolve('appdata'));

const indexSync = createIndexSync({
	loadCatalog,
	hashes: CatalogCoverHashesRepository,
	suggestions: CoverSuggestionsRepository,
	getHashQueue: getCoverHashQueue,
});

const matcher = createMatcher({
	getConfig: () => matchConfigFrom(CONFIG_ENV),
	listConnectorIds,
	listConnectorsByManga: MangaConnectorsRepository.listConnectorsByManga,
	listLinksByPlugin: MangaConnectorsRepository.listLinksByPlugin,
	hashes: CatalogCoverHashesRepository,
	suggestions: CoverSuggestionsRepository,
	readLocalCover: (idManga) => coverStore.read(paths.localCover(idManga)),
	hashImage: hashCoverImage,
	loadCatalog,
	logger,
});

const CoverSuggestions = {
	syncConnectorIndex: indexSync.syncConnector,
	syncAllIndexes: () => indexSync.syncAll(listConnectorIds()),
	hashCover: createHashCoverJob({
		paths,
		store: coverStore,
		downloadCover: createCoverDownloader(),
		withDomainSlot,
		hashImage: hashCoverImage,
		hashes: CatalogCoverHashesRepository,
		logger,
	}),
	matchManga: matcher.matchManga,
	matchAll: matcher.matchAll,
	matchMangaSuggestions: createMangaMatchJob({
		findMangaById: MangasRepository.findMangaById,
		matchManga: matcher.matchManga,
	}),
};
export default CoverSuggestions;

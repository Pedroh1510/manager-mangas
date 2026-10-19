import CoverSuggestionsRepository from '../../repository/coverSuggestions.js';
import MangaConnectorsRepository from '../../repository/mangaConnectors.js';
import MangasRepository from '../../repository/mangas.js';
import MangaService from '../manga.js';
import MangaAdminService from '../mangaAdmin.js';
import { enqueueBackgroundTask } from '../queue/backgroundQueue.js';
import CoverSuggestions from './index.js';
import { createSuggestionService } from './suggestionService.js';
import { createCoverSyncRequest } from './syncRequest.js';

// Wired apart from index.js: mangaAdmin -> backgroundQueue -> index.js, so
// importing mangaAdmin there would close an import cycle.
const SuggestionService = createSuggestionService({
	repository: CoverSuggestionsRepository,
	findConnector: ({ idManga, idPlugin }) =>
		MangaConnectorsRepository.findConnector({ idManga, idPlugin }),
	findMangaById: MangasRepository.findMangaById,
	linkConnector: (link) => MangaAdminService.linkConnector(link),
	matchManga: CoverSuggestions.matchManga,
});
export default SuggestionService;

export const requestCoverSync = createCoverSyncRequest({
	hasConnector: (idPlugin) => MangaService.hasConnector(idPlugin),
	enqueue: (...job) => enqueueBackgroundTask(...job),
});

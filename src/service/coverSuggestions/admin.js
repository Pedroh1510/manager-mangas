import CoverSuggestionsRepository from '../../repository/coverSuggestions.js';
import MangaConnectorsRepository from '../../repository/mangaConnectors.js';
import MangasRepository from '../../repository/mangas.js';
import MangaAdminService from '../mangaAdmin.js';
import CoverSuggestions from './index.js';
import { createSuggestionService } from './suggestionService.js';

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

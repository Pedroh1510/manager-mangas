import express from 'express';
import SuggestionService, {
	requestCoverSync,
} from '../service/coverSuggestions/admin.js';
import CoverSuggestionsValidator from '../validators/coverSuggestionsValidator.js';

const coverSuggestionsAdmController = express.Router();
export default coverSuggestionsAdmController;

/**
 * @swagger
 * /mangas/adm/suggestions:
 *   get:
 *     tags: [MangaAdm]
 *     description: Connector suggestions matched by cover, split into linkable suggestions and conflicts (item already linked to another manga)
 *     parameters:
 *       - name: status
 *         in: query
 *         required: false
 *         type: string
 *         enum: [pending, accepted, dismissed]
 *     responses:
 *       200:
 *         description: Returns { suggestions, conflicts }
 *       400:
 *         description: Invalid status
 */
coverSuggestionsAdmController.get(
	'/suggestions',
	CoverSuggestionsValidator.listQuery,
	async (req, res) => {
		const status = req.query.status ?? 'pending';
		res.status(200).send(await SuggestionService.list({ status }));
	},
);

/**
 * @swagger
 * /mangas/adm/suggestions/{idSuggestion}/accept:
 *   post:
 *     tags: [MangaAdm]
 *     description: Link the suggested connector item to the manga
 *     parameters:
 *       - name: idSuggestion
 *         in: path
 *         required: true
 *         type: integer
 *     responses:
 *       200:
 *         description: Returns { idMangaConnector, idManga, idPlugin }
 *       400:
 *         description: Invalid idSuggestion
 *       404:
 *         description: Suggestion not found
 *       409:
 *         description: Not pending, conflicting, or the manga already has that connector
 */
coverSuggestionsAdmController.post(
	'/suggestions/:idSuggestion/accept',
	CoverSuggestionsValidator.idSuggestionParam,
	async (req, res) => {
		const idSuggestion = Number(req.params.idSuggestion);
		res.status(200).send(await SuggestionService.accept({ idSuggestion }));
	},
);

/**
 * @swagger
 * /mangas/adm/suggestions/{idSuggestion}/dismiss:
 *   post:
 *     tags: [MangaAdm]
 *     description: Dismiss a suggestion for good
 *     parameters:
 *       - name: idSuggestion
 *         in: path
 *         required: true
 *         type: integer
 *     responses:
 *       200:
 *         description: Returns { idSuggestion, status }
 *       400:
 *         description: Invalid idSuggestion
 *       404:
 *         description: Suggestion not found
 *       409:
 *         description: Suggestion is not pending
 */
coverSuggestionsAdmController.post(
	'/suggestions/:idSuggestion/dismiss',
	CoverSuggestionsValidator.idSuggestionParam,
	async (req, res) => {
		const idSuggestion = Number(req.params.idSuggestion);
		res.status(200).send(await SuggestionService.dismiss({ idSuggestion }));
	},
);

/**
 * @swagger
 * /mangas/adm/{idManga}/suggestions/refresh:
 *   post:
 *     tags: [MangaAdm]
 *     description: Rerun the cover matching of one manga
 *     parameters:
 *       - name: idManga
 *         in: path
 *         required: true
 *         type: integer
 *     responses:
 *       200:
 *         description: Returns { idManga, suggestions, conflicts }
 *       400:
 *         description: Invalid idManga
 *       404:
 *         description: Manga not found
 */
coverSuggestionsAdmController.post(
	'/:idManga/suggestions/refresh',
	CoverSuggestionsValidator.idMangaParam,
	async (req, res) => {
		const idManga = Number(req.params.idManga);
		res.status(200).send(await SuggestionService.refresh({ idManga }));
	},
);

/**
 * @swagger
 * /mangas/adm/covers/sync:
 *   post:
 *     tags: [MangaAdm]
 *     description: Enqueue the cover hash index sync of one connector, or of every connector when idPlugin is omitted
 *     parameters:
 *       - name: idPlugin
 *         in: query
 *         required: false
 *         type: string
 *     responses:
 *       202:
 *         description: Sync enqueued; returns { idPlugin } (null for every connector)
 *       400:
 *         description: Invalid query
 *       404:
 *         description: Unknown idPlugin
 */
coverSuggestionsAdmController.post(
	'/covers/sync',
	CoverSuggestionsValidator.coverSyncQuery,
	async (req, res) => {
		const idPlugin = req.query.idPlugin || undefined;
		res.status(202).send(await requestCoverSync({ idPlugin }));
	},
);

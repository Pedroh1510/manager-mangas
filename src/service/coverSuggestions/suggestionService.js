import { ConflictError, NotFoundError } from '../../infra/errors.js';

function toSuggestion(row) {
	return {
		idSuggestion: row.idSuggestion,
		idManga: row.idManga,
		title: row.title,
		idPlugin: row.idPlugin,
		idMangaPlugin: row.idMangaPlugin,
		titlePlugin: row.titlePlugin,
		score: row.score,
		band: row.band,
		titleSimilarity: row.titleSimilarity,
	};
}

function splitConflicts(rows) {
	return {
		suggestions: rows
			.filter((row) => row.conflictIdManga === null)
			.map(toSuggestion),
		conflicts: rows
			.filter((row) => row.conflictIdManga !== null)
			.map((row) => ({
				...toSuggestion(row),
				conflictIdManga: row.conflictIdManga,
				conflictTitle: row.conflictTitle,
			})),
	};
}

function conflict(message) {
	return new ConflictError({
		message,
		action: 'Atualize a lista de sugestões',
	});
}

/**
 * Builds the admin side of suggestions: list, accept (links the connector),
 * dismiss and per-manga refresh.
 * @example await createSuggestionService(deps).accept({ idSuggestion: 3 }) // { idMangaConnector, idManga, idPlugin }
 */
export function createSuggestionService({
	repository,
	findConnector,
	findMangaById,
	linkConnector,
	matchManga,
}) {
	async function findOrFail(idSuggestion) {
		const suggestion = await repository.findById({ idSuggestion });
		if (suggestion) return suggestion;
		throw new NotFoundError({
			message: `Suggestion ${idSuggestion} not found`,
			action: 'Check idSuggestion',
		});
	}

	async function assertAcceptable(suggestion) {
		if (suggestion.status !== 'pending')
			throw conflict(
				`Suggestion ${suggestion.idSuggestion} is ${suggestion.status}, expected pending`,
			);
		if (suggestion.conflictIdManga !== null)
			throw conflict(
				`Item ${suggestion.idMangaPlugin} of ${suggestion.idPlugin} is already linked to manga ${suggestion.conflictIdManga}`,
			);
		const existing = await findConnector(suggestion);
		if (existing)
			throw conflict(
				`Manga ${suggestion.idManga} is already linked to ${suggestion.idPlugin}`,
			);
	}

	async function claim(idSuggestion, to) {
		const moved = await repository.moveStatus({
			idSuggestion,
			from: 'pending',
			to,
		});
		if (!moved)
			throw conflict(`Suggestion ${idSuggestion} is no longer pending`);
	}

	async function accept({ idSuggestion }) {
		const suggestion = await findOrFail(idSuggestion);
		await assertAcceptable(suggestion);
		await claim(idSuggestion, 'accepted');
		const { idManga, idPlugin, idMangaPlugin, titlePlugin } = suggestion;
		try {
			return await linkConnector({
				idManga,
				idPlugin,
				idMangaPlugin,
				titlePlugin,
			});
		} catch (error) {
			await repository.moveStatus({
				idSuggestion,
				from: 'accepted',
				to: 'pending',
			});
			throw error;
		}
	}

	async function dismiss({ idSuggestion }) {
		await findOrFail(idSuggestion);
		await claim(idSuggestion, 'dismissed');
		return { idSuggestion, status: 'dismissed' };
	}

	async function list({ status }) {
		return splitConflicts(await repository.listByStatus({ status }));
	}

	async function refresh({ idManga }) {
		const manga = await findMangaById({ idManga });
		if (!manga || manga.deletedAt)
			throw new NotFoundError({
				message: `Manga ${idManga} not found`,
				action: 'Check idManga',
			});
		await matchManga({ idManga, title: manga.title });
		const pending = await repository.listByStatus({
			status: 'pending',
			idManga,
		});
		return { idManga, ...splitConflicts(pending) };
	}

	return { list, accept, dismiss, refresh };
}

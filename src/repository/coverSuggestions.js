import database from '../infra/database.js';

const SUGGESTION_COLUMNS = `s."idCoverSuggestion" AS "idSuggestion", s."idManga", m."title",
	s."idPlugin", s."idMangaPlugin", s."titlePlugin", s."band", s."status",
	greatest(s."dSimilarity", s."pSimilarity") AS "score", s."titleSimilarity",
	other."idManga" AS "conflictIdManga", otherManga."title" AS "conflictTitle"`;

// A suggestion is a conflict while its item is linked to another manga; the
// unique (idPlugin, idMangaPlugin) on mangaConnectors would refuse the link.
const SUGGESTION_JOINS = `FROM "coverSuggestions" s
	JOIN "mangas" m ON m."idManga" = s."idManga"
	LEFT JOIN "mangaConnectors" other
		ON lower(other."idPlugin") = lower(s."idPlugin") AND other."idMangaPlugin" = s."idMangaPlugin"
		AND other."idManga" <> s."idManga"
	LEFT JOIN "mangas" otherManga ON otherManga."idManga" = other."idManga"`;

/**
 * Non-deleted mangas lacking a link to at least one of `connectorIds`.
 * @example await listMangasMissingConnectors({ connectorIds: ['mangeek', 'nexustoons'] })
 */
async function listMangasMissingConnectors({ connectorIds }) {
	const ids = connectorIds.map((id) => id.toLowerCase());
	const { rows } = await database.query({
		text: `SELECT m."idManga", m."title" FROM "mangas" m
			WHERE m."deletedAt" IS NULL AND (
				SELECT count(DISTINCT lower(mc."idPlugin")) FROM "mangaConnectors" mc
				WHERE mc."idManga" = m."idManga" AND lower(mc."idPlugin") = ANY($1::text[])
			) < cardinality($1::text[])
			ORDER BY m."idManga"`,
		values: [ids],
	});
	return rows;
}

/**
 * Swaps the pending suggestions of a manga for `suggestions` in one
 * transaction; decided pairs are left as they are.
 * @example await replacePending({ idManga: 7, suggestions: [{ idPlugin, idMangaPlugin, titlePlugin, dSimilarity, pSimilarity, titleSimilarity, band }] })
 */
async function replacePending({ idManga, suggestions }) {
	const client = await database.getNewClient();
	try {
		await client.query('BEGIN');
		await client.query({
			text: `DELETE FROM "coverSuggestions" WHERE "idManga" = $1 AND "status" = 'pending'`,
			values: [idManga],
		});
		for (const suggestion of suggestions) {
			await client.query({
				text: `INSERT INTO "coverSuggestions"
						("idManga", "idPlugin", "idMangaPlugin", "titlePlugin", "dSimilarity", "pSimilarity", "titleSimilarity", "band")
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
					ON CONFLICT ("idManga", "idPlugin", "idMangaPlugin") DO NOTHING`,
				values: [
					idManga,
					suggestion.idPlugin,
					suggestion.idMangaPlugin,
					suggestion.titlePlugin,
					suggestion.dSimilarity,
					suggestion.pSimilarity,
					suggestion.titleSimilarity,
					suggestion.band,
				],
			});
		}
		await client.query('COMMIT');
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		await client.end();
	}
}

/**
 * Suggestions with `status`, strong first, best score first.
 * @example await listByStatus({ status: 'pending' })
 */
async function listByStatus({ status, idManga = null }) {
	const { rows } = await database.query({
		text: `SELECT ${SUGGESTION_COLUMNS} ${SUGGESTION_JOINS}
			WHERE s."status" = $1 AND ($2::integer IS NULL OR s."idManga" = $2)
			ORDER BY (s."band" = 'strong') DESC, "score" DESC, s."titleSimilarity" DESC, s."idCoverSuggestion"`,
		values: [status, idManga],
	});
	return rows;
}

/**
 * One suggestion with its conflict columns, or null.
 * @example await findById({ idSuggestion: 3 })
 */
async function findById({ idSuggestion }) {
	const { rows } = await database.query({
		text: `SELECT ${SUGGESTION_COLUMNS} ${SUGGESTION_JOINS} WHERE s."idCoverSuggestion" = $1`,
		values: [idSuggestion],
	});
	return rows[0] ?? null;
}

/**
 * Moves a suggestion between statuses only from `from`; false when it was
 * not in `from` any more.
 * @example await moveStatus({ idSuggestion: 3, from: 'pending', to: 'dismissed' }) // true
 */
async function moveStatus({ idSuggestion, from, to }) {
	const { rowCount } = await database.query({
		text: `UPDATE "coverSuggestions"
			SET "status" = $3::varchar, "decidedAt" = CASE WHEN $3::varchar = 'pending' THEN NULL ELSE now() END
			WHERE "idCoverSuggestion" = $1 AND "status" = $2`,
		values: [idSuggestion, from, to],
	});
	return rowCount === 1;
}

/**
 * Drops the pending suggestions of a manga for one connector.
 * @example await deletePendingByConnector({ idManga: 7, idPlugin: 'mangeek' })
 */
async function deletePendingByConnector({ idManga, idPlugin }) {
	await database.query({
		text: `DELETE FROM "coverSuggestions"
			WHERE "idManga" = $1 AND lower("idPlugin") = lower($2) AND "status" = 'pending'`,
		values: [idManga, idPlugin],
	});
}

/**
 * Drops the pending suggestions pointing at catalog items of one connector.
 * @example await deletePendingByItems({ idPlugin: 'mangeek', idMangaPlugins: ['3'] })
 */
async function deletePendingByItems({ idPlugin, idMangaPlugins }) {
	if (!idMangaPlugins.length) return;
	await database.query({
		text: `DELETE FROM "coverSuggestions"
			WHERE lower("idPlugin") = lower($1) AND "idMangaPlugin" = ANY($2::text[]) AND "status" = 'pending'`,
		values: [idPlugin, idMangaPlugins],
	});
}

const CoverSuggestionsRepository = {
	listMangasMissingConnectors,
	replacePending,
	listByStatus,
	findById,
	moveStatus,
	deletePendingByConnector,
	deletePendingByItems,
};
export default CoverSuggestionsRepository;

import database from '../../../infra/database.js';

/**
 * Direct SQL seeds for cover-suggestion integration tests: no service side
 * effects (cover downloads, pending cleanup) run while arranging.
 * @example const idManga = await seedManga('Solo Leveling');
 */
export async function seedManga(title, { deleted = false } = {}) {
	const { rows } = await database.query({
		text: `INSERT INTO mangas (title, "deletedAt") VALUES ($1, $2) RETURNING "idManga"`,
		values: [title, deleted ? new Date() : null],
	});
	return rows[0].idManga;
}

export async function seedLink(
	idManga,
	idPlugin,
	idMangaPlugin,
	{ isActive = true, titlePlugin = 'T' } = {},
) {
	await database.query({
		text: `INSERT INTO "mangaConnectors" ("idManga", "idPlugin", "idMangaPlugin", "titlePlugin", "isActive")
			VALUES ($1, $2, $3, $4, $5)`,
		values: [idManga, idPlugin, idMangaPlugin, titlePlugin, isActive],
	});
}

export async function seedHash(idPlugin, idMangaPlugin, { dHash, pHash }) {
	await database.query({
		text: `INSERT INTO "catalogCoverHashes" ("idPlugin", "idMangaPlugin", "coverUrl", "dHash", "pHash", "hashedAt")
			VALUES ($1, $2, $3, $4, $5, now())`,
		values: [
			idPlugin,
			idMangaPlugin,
			`https://img.example/${idMangaPlugin}.jpg`,
			BigInt.asIntN(64, dHash).toString(),
			BigInt.asIntN(64, pHash).toString(),
		],
	});
}

export async function seedSuggestion(
	idManga,
	idPlugin,
	idMangaPlugin,
	overrides = {},
) {
	const values = {
		titlePlugin: `Title ${idMangaPlugin}`,
		dSimilarity: 0.95,
		pSimilarity: 0.9,
		titleSimilarity: 0,
		band: 'strong',
		status: 'pending',
		origin: 'cover',
		...overrides,
	};
	const { rows } = await database.query({
		text: `INSERT INTO "coverSuggestions"
				("idManga", "idPlugin", "idMangaPlugin", "titlePlugin", "dSimilarity", "pSimilarity", "titleSimilarity", "band", "status", "origin")
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING "idCoverSuggestion"`,
		values: [
			idManga,
			idPlugin,
			idMangaPlugin,
			values.titlePlugin,
			values.dSimilarity,
			values.pSimilarity,
			values.titleSimilarity,
			values.band,
			values.status,
			values.origin,
		],
	});
	return rows[0].idCoverSuggestion;
}

export async function suggestionRows(idManga) {
	const { rows } = await database.query({
		text: `SELECT "idCoverSuggestion", "idPlugin", "idMangaPlugin", "status", "decidedAt"
			FROM "coverSuggestions" WHERE "idManga" = $1 ORDER BY "idMangaPlugin"`,
		values: [idManga],
	});
	return rows;
}

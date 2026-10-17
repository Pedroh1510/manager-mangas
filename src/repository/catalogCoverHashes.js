import database from '../infra/database.js';

// pg returns bigint as a string; hashes travel as BigInt inside the app.
function toHash(value) {
	return value === null || value === undefined ? null : BigInt(value);
}

function toHashRow(row) {
	return { ...row, dHash: toHash(row.dHash), pHash: toHash(row.pHash) };
}

function toParam(hash) {
	return BigInt.asIntN(64, hash).toString();
}

/**
 * Every index row of one connector, hashed or not.
 * @example await listByPlugin({ idPlugin: 'nexustoons' }) // [{ idMangaPlugin, coverUrl, dHash, ... }]
 */
async function listByPlugin({ idPlugin }) {
	const { rows } = await database.query({
		text: `SELECT "idMangaPlugin", "coverUrl", "dHash", "pHash", "failureCount", "failedAt", "hashedAt"
			FROM "catalogCoverHashes" WHERE "idPlugin" = $1`,
		values: [idPlugin],
	});
	return rows.map(toHashRow);
}

/**
 * Hashed rows of the given catalog items, used as matching references.
 * @example await listHashedItems([{ idPlugin: 'mangeek', idMangaPlugin: '1' }])
 * @param {Array<{idPlugin: string, idMangaPlugin: string}>} items
 */
async function listHashedItems(items) {
	if (!items.length) return [];
	const { rows } = await database.query({
		text: `SELECT h."idPlugin", h."idMangaPlugin", h."dHash", h."pHash"
			FROM "catalogCoverHashes" h
			JOIN unnest($1::text[], $2::text[]) AS i("idPlugin", "idMangaPlugin")
				ON lower(h."idPlugin") = lower(i."idPlugin") AND h."idMangaPlugin" = i."idMangaPlugin"
			WHERE h."dHash" IS NOT NULL`,
		values: [
			items.map((item) => item.idPlugin),
			items.map((item) => item.idMangaPlugin),
		],
	});
	return rows.map(toHashRow);
}

/**
 * Stores the hashes of one item and clears any failure state.
 * @example await upsertHash({ idPlugin, idMangaPlugin, coverUrl, dHash: 1n, pHash: 2n, hashedAt: new Date() })
 */
async function upsertHash({
	idPlugin,
	idMangaPlugin,
	coverUrl,
	dHash,
	pHash,
	hashedAt,
}) {
	await database.query({
		text: `INSERT INTO "catalogCoverHashes"
				("idPlugin", "idMangaPlugin", "coverUrl", "dHash", "pHash", "hashedAt", "failureCount", "failedAt")
			VALUES ($1, $2, $3, $4, $5, $6, 0, NULL)
			ON CONFLICT ("idPlugin", "idMangaPlugin") DO UPDATE SET
				"coverUrl" = EXCLUDED."coverUrl", "dHash" = EXCLUDED."dHash", "pHash" = EXCLUDED."pHash",
				"hashedAt" = EXCLUDED."hashedAt", "failureCount" = 0, "failedAt" = NULL`,
		values: [
			idPlugin,
			idMangaPlugin,
			coverUrl,
			toParam(dHash),
			toParam(pHash),
			hashedAt,
		],
	});
}

/**
 * Records one failed hash attempt; a different coverUrl restarts the count.
 * @example await recordFailure({ idPlugin, idMangaPlugin, coverUrl, failedAt: new Date() })
 */
async function recordFailure({ idPlugin, idMangaPlugin, coverUrl, failedAt }) {
	await database.query({
		text: `INSERT INTO "catalogCoverHashes"
				("idPlugin", "idMangaPlugin", "coverUrl", "dHash", "pHash", "failureCount", "failedAt")
			VALUES ($1, $2, $3, NULL, NULL, 1, $4)
			ON CONFLICT ("idPlugin", "idMangaPlugin") DO UPDATE SET
				"dHash" = NULL, "pHash" = NULL, "failedAt" = EXCLUDED."failedAt",
				"failureCount" = CASE WHEN "catalogCoverHashes"."coverUrl" = EXCLUDED."coverUrl"
					THEN "catalogCoverHashes"."failureCount" + 1 ELSE 1 END,
				"coverUrl" = EXCLUDED."coverUrl"`,
		values: [idPlugin, idMangaPlugin, coverUrl, failedAt],
	});
}

/**
 * Deletes the rows of items no longer in the catalog; returns their ids.
 * @example await deleteMissing({ idPlugin: 'mangeek', keepIds: ['1', '2'] }) // ['3']
 */
async function deleteMissing({ idPlugin, keepIds }) {
	const { rows } = await database.query({
		text: `DELETE FROM "catalogCoverHashes"
			WHERE "idPlugin" = $1 AND NOT ("idMangaPlugin" = ANY($2::text[]))
			RETURNING "idMangaPlugin"`,
		values: [idPlugin, keepIds],
	});
	return rows.map((row) => row.idMangaPlugin);
}

/**
 * Hashed items of `idPlugin` within `maxDistance` bits of any reference, in
 * dHash or pHash, with the manga already linked to each item, if any.
 * @example await findCandidates({ idPlugin: 'nexustoons', references: [{ dHash: 1n, pHash: 2n }], maxDistance: 12 })
 */
async function findCandidates({ idPlugin, references, maxDistance }) {
	if (!references.length) return [];
	const { rows } = await database.query({
		text: `SELECT h."idMangaPlugin", h."dHash", h."pHash",
				mc."idManga" AS "linkedIdManga", m."title" AS "linkedTitle"
			FROM "catalogCoverHashes" h
			LEFT JOIN "mangaConnectors" mc
				ON lower(mc."idPlugin") = lower(h."idPlugin") AND mc."idMangaPlugin" = h."idMangaPlugin"
			LEFT JOIN "mangas" m ON m."idManga" = mc."idManga"
			WHERE h."idPlugin" = $1 AND h."dHash" IS NOT NULL
				AND EXISTS (
					SELECT 1 FROM unnest($2::bigint[], $3::bigint[]) AS r(d, p)
					WHERE bit_count((h."dHash" # r.d)::bit(64)) <= $4
						OR bit_count((h."pHash" # r.p)::bit(64)) <= $4
				)`,
		values: [
			idPlugin,
			references.map((reference) => toParam(reference.dHash)),
			references.map((reference) => toParam(reference.pHash)),
			maxDistance,
		],
	});
	return rows.map(toHashRow);
}

const CatalogCoverHashesRepository = {
	listByPlugin,
	listHashedItems,
	upsertHash,
	recordFailure,
	deleteMissing,
	findCandidates,
};
export default CatalogCoverHashesRepository;

// Chapters of one link that discovery never records (GLOSSARY: "Capítulo
// bloqueado"). Keyed by (idMangaConnector, idChapterPlugin).
import sql from 'sql-bricks-postgres';
import database from '../infra/database.js';

/**
 * Idempotent per (idMangaConnector, idChapterPlugin): re-blocking an already
 * blocked chapter (e.g. retry after the delete step failed) refreshes the
 * reason and returns the existing id instead of violating the UNIQUE.
 * @example await insertBlocked({ idMangaConnector: 3, idChapterPlugin: 'ch-177', volume: 177, reason: null })
 * @param {{ idMangaConnector: number, idChapterPlugin: string, volume: string|number, reason: string|null }} params
 * @returns {Promise<{ idBlockedChapter: number }>}
 */
async function insertBlocked({
	idMangaConnector,
	idChapterPlugin,
	volume,
	reason,
}) {
	const { rows } = await database.query({
		text: `INSERT INTO "blockedChapters" ("idMangaConnector", "idChapterPlugin", "volume", "reason")
			VALUES ($1, $2, $3, $4)
			ON CONFLICT ("idMangaConnector", "idChapterPlugin")
			DO UPDATE SET "reason" = EXCLUDED."reason"
			RETURNING "idBlockedChapter"`,
		values: [idMangaConnector, idChapterPlugin, volume, reason],
	});
	return rows[0];
}

/**
 * @example await listBlockedByManga({ idManga: 9 })
 * @param {{ idManga: number }} params
 * @returns {Promise<Array<{ idBlockedChapter: number, idMangaConnector: number, idPlugin: string, idChapterPlugin: string, volume: string, reason: string|null, createdAt: Date }>>}
 */
async function listBlockedByManga({ idManga }) {
	const { rows } = await database.query(
		sql
			.select(
				'b."idBlockedChapter"',
				'b."idMangaConnector"',
				'mc."idPlugin"',
				'b."idChapterPlugin"',
				'b."volume"',
				'b."reason"',
				'b."createdAt"',
			)
			.from('"blockedChapters" b')
			.join('"mangaConnectors" mc', {
				'b."idMangaConnector"': sql('mc."idMangaConnector"'),
			})
			.where({ 'mc."idManga"': idManga })
			.orderBy('b."volume"')
			.toParams(),
	);
	return rows;
}

/**
 * Deletes only when the block belongs to the manga, so one manga cannot
 * unblock another's chapter.
 * @example await deleteBlocked({ idManga: 9, idBlockedChapter: 2 }) // 1
 * @param {{ idManga: number, idBlockedChapter: number }} params
 * @returns {Promise<number>} rowCount
 */
async function deleteBlocked({ idManga, idBlockedChapter }) {
	const { rowCount } = await database.query(
		sql
			.deleteFrom('blockedChapters')
			.where({ idBlockedChapter })
			.where(
				sql.in(
					'"idMangaConnector"',
					sql
						.select('"idMangaConnector"')
						.from('mangaConnectors')
						.where({ idManga }),
				),
			)
			.toParams(),
	);
	return rowCount;
}

/**
 * Keys in the format planDiscovery expects (see blockKey in chapterGap.js).
 * @example await listBlockedKeysByManga({ idManga: 9 }) // Set { '3:ch-177' }
 * @param {{ idManga: number }} params
 * @returns {Promise<Set<string>>}
 */
async function listBlockedKeysByManga({ idManga }) {
	const blocked = await listBlockedByManga({ idManga });
	return new Set(
		blocked.map((row) => `${row.idMangaConnector}:${row.idChapterPlugin}`),
	);
}

const BlockedChaptersRepository = {
	insertBlocked,
	listBlockedByManga,
	deleteBlocked,
	listBlockedKeysByManga,
};

export default BlockedChaptersRepository;

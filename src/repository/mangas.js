import sql from 'sql-bricks-postgres';
import database from '../infra/database.js';
import { searchTitlesOf } from '../utils/altTitles.js';
import { normalizeTitle } from '../service/coverSuggestions/titleSimilarity.js';

async function createManga({ title }) {
	const { rows } = await database.query(
		sql
			.insertInto('mangas', { title, searchTitles: searchTitlesOf(title, []) })
			.returning('idManga')
			.toParams(),
	);
	return rows[0];
}

async function findMangaByTitleIncludingDeleted({ title }) {
	const { rows } = await database.query(
		sql
			.select('idManga', 'deletedAt')
			.from('mangas')
			.where({ title })
			.toParams(),
	);
	return rows[0] ?? null;
}

async function findMangaById({ idManga }) {
	const { rows } = await database.query(
		sql
			.select(
				'idManga',
				'title',
				'altTitles',
				'createdAt',
				'updatedAt',
				'deletedAt',
			)
			.from('mangas')
			.where({ idManga })
			.toParams(),
	);
	return rows[0] ?? null;
}

// One query for the whole list: the admin screen shows every manga with its
// connector links, and a per-manga lookup would be N+1 over hundreds of rows.
const CONNECTORS_JSON = `COALESCE(
	json_agg(
		json_build_object(
			'idMangaConnector', "mangaConnectors"."idMangaConnector",
			'idPlugin', "mangaConnectors"."idPlugin",
			'titlePlugin', "mangaConnectors"."titlePlugin",
			'isActive', "mangaConnectors"."isActive"
		) ORDER BY "mangaConnectors"."idPlugin"
	) FILTER (WHERE "mangaConnectors"."idMangaConnector" IS NOT NULL),
	'[]'
) AS "connectors"`;

async function listMangas({ title } = {}) {
	let where = { '"mangas"."deletedAt"': null };
	if (title) {
		// The normalized term has only letters, digits and spaces, so it
		// carries no LIKE wildcard.
		where = sql.and(
			where,
			sql(
				'EXISTS (SELECT 1 FROM unnest("mangas"."searchTitles") AS t WHERE t LIKE $)',
				`%${normalizeTitle(title)}%`,
			),
		);
	}
	const { rows } = await database.query(
		sql
			.select(
				'"mangas"."idManga"',
				'"mangas"."title"',
				'"mangas"."altTitles"',
				'"mangas"."createdAt"',
				'"mangas"."updatedAt"',
				CONNECTORS_JSON,
			)
			.from('mangas')
			.leftJoin('mangaConnectors')
			.on({ '"mangaConnectors"."idManga"': '"mangas"."idManga"' })
			.where(where)
			.groupBy('"mangas"."idManga"')
			.orderBy('"mangas"."title"')
			.toParams(),
	);
	return rows;
}

async function softDeleteManga({ idManga }) {
	await database.query(
		sql
			.update('mangas', { deletedAt: new Date() })
			.where({ idManga })
			.toParams(),
	);
}

/**
 * Replaces the alternative titles and recomputes `searchTitles` with them.
 * @example await updateAltTitles({ idManga: 1, title: 'Solo Leveling', altTitles: ['Upando Sozinho'] })
 */
async function updateAltTitles({ idManga, title, altTitles }) {
	const { rows } = await database.query(
		sql
			.update('mangas', {
				altTitles,
				searchTitles: searchTitlesOf(title, altTitles),
				updatedAt: new Date(),
			})
			.where({ idManga })
			.returning('idManga', 'title', 'altTitles')
			.toParams(),
	);
	return rows[0] ?? null;
}

const MangasRepository = {
	createManga,
	findMangaByTitleIncludingDeleted,
	findMangaById,
	listMangas,
	softDeleteManga,
	updateAltTitles,
};
export default MangasRepository;

import sql from 'sql-bricks-postgres';
import database from '../infra/database.js';

async function createManga({ title }) {
	const { rows } = await database.query(
		sql.insertInto('mangas', { title }).returning('idManga').toParams(),
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
			.select('idManga', 'title', 'createdAt', 'updatedAt', 'deletedAt')
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
		where = sql.and(
			where,
			sql.like('lower("mangas"."title")', `%${title.toLowerCase()}%`),
		);
	}
	const { rows } = await database.query(
		sql
			.select(
				'"mangas"."idManga"',
				'"mangas"."title"',
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

const MangasRepository = {
	createManga,
	findMangaByTitleIncludingDeleted,
	findMangaById,
	listMangas,
	softDeleteManga,
};
export default MangasRepository;

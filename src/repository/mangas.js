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

async function listMangas({ title } = {}) {
	let where = { deletedAt: null };
	if (title) {
		where = sql.and(
			{ deletedAt: null },
			sql.like('lower("title")', `%${title.toLowerCase()}%`),
		);
	}
	const { rows } = await database.query(
		sql
			.select('idManga', 'title', 'createdAt', 'updatedAt')
			.from('mangas')
			.where(where)
			.orderBy('title')
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

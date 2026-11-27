import sql from 'sql-bricks-postgres';
import database from '../infra/database.js';

async function insertChapter({
	idManga,
	idMangaConnector,
	idChapterPlugin,
	name,
	volume,
}) {
	const result = await database
		.query(
			sql
				.insertInto('chapters', {
					idManga,
					idMangaConnector,
					idChapterPlugin,
					name,
					volume,
				})
				.returning('idChapter')
				.toParams(),
		)
		.catch((error) => {
			if (!error.message.includes('duplicate key')) {
				throw error;
			}
		});
	return result?.rows[0];
}

async function listChaptersByManga({ idManga }) {
	const { rows } = await database.query(
		sql
			.select(
				'idChapter',
				'idMangaConnector',
				'idChapterPlugin',
				'name',
				'volume',
				'downloadedAt',
			)
			.from('chapters')
			.where({ idManga })
			.orderBy('volume')
			.toParams(),
	);
	return rows;
}

async function findChapterById({ idChapter }) {
	const { rows } = await database.query(
		sql
			.select(
				'"chapters"."idChapter"',
				'"chapters"."idManga"',
				'"chapters"."idMangaConnector"',
				'"chapters"."idChapterPlugin"',
				'"chapters"."volume"',
				'"chapters"."downloadedAt"',
				'"mangaConnectors"."idPlugin"',
				'"mangas"."title"',
			)
			.from('chapters')
			.join('mangaConnectors')
			.on({
				'"mangaConnectors"."idMangaConnector"': '"chapters"."idMangaConnector"',
			})
			.join('mangas')
			.on({ '"mangas"."idManga"': '"chapters"."idManga"' })
			.where({ '"chapters"."idChapter"': idChapter })
			.toParams(),
	);
	return rows[0] ?? null;
}

async function deleteChapter({ idChapter }) {
	await database.query(
		sql.deleteFrom('chapters').where({ idChapter }).toParams(),
	);
}

async function deleteChaptersByManga({ idManga }) {
	await database.query(
		sql.deleteFrom('chapters').where({ idManga }).toParams(),
	);
}

async function markDownloaded({ idChapter }) {
	await database.query(
		sql
			.update('chapters', { downloadedAt: new Date() })
			.where({ idChapter })
			.toParams(),
	);
}

/**
 * Points a chapter row at another source after its file was replaced. A
 * UNIQUE violation (that plugin chapter already stored in another row)
 * propagates so the caller can answer 409.
 * @example await updateChapterSource({ idChapter: 1248700, idMangaConnector: 31, idChapterPlugin: '435999', name: 'Capítulo 177' })
 * @param {{ idChapter: number, idMangaConnector: number, idChapterPlugin: string, name: string }} params
 * @returns {Promise<void>}
 */
async function updateChapterSource({
	idChapter,
	idMangaConnector,
	idChapterPlugin,
	name,
}) {
	const values = { idMangaConnector, idChapterPlugin, name };
	await database.query(
		sql
			.update('chapters', { ...values, downloadedAt: new Date() })
			.where({ idChapter })
			.toParams(),
	);
}

async function listMissingDownloads({ idManga } = {}) {
	const where = { '"chapters"."downloadedAt"': null };
	if (idManga) {
		where['"chapters"."idManga"'] = idManga;
	}
	const { rows } = await database.query(
		sql
			.select(
				'"chapters"."idChapter"',
				'"chapters"."idChapterPlugin"',
				'"chapters"."volume"',
				'"mangaConnectors"."idPlugin"',
				'"mangas"."title"',
			)
			.from('chapters')
			.join('mangaConnectors')
			.on({
				'"mangaConnectors"."idMangaConnector"': '"chapters"."idMangaConnector"',
			})
			.join('mangas')
			.on({ '"mangas"."idManga"': '"chapters"."idManga"' })
			.where(where)
			.orderBy('volume')
			.toParams(),
	);
	return rows;
}

const ChaptersRepository = {
	insertChapter,
	listChaptersByManga,
	findChapterById,
	deleteChapter,
	deleteChaptersByManga,
	markDownloaded,
	updateChapterSource,
	listMissingDownloads,
};
export default ChaptersRepository;

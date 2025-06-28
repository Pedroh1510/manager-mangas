import SqlBricks from 'sql-bricks-postgres';
import database from '../infra/database.js';

/**
 *
 * @param {Object} param
 * @param {String[]} param.title
 * @returns {Promise<{titleList:String|null,title:string,name:string,volume:number}[]>}
 */
async function listChapters({ title }) {
	return database
		.query(
			SqlBricks.select('titlePlugin', 'title', 'name', 'volume')
				.from('chapters')
				.join('mangasPlugins')
				.on({ '"mangasPlugins"."idPlugin"': 'chapters."pluginId"' })
				.join('mangas')
				.on({
					'"mangasPlugins"."idManga"': 'mangas."idManga"',
					'"chapters"."idManga"': 'mangas."idManga"'
				})
				.where(
					SqlBricks.or(
						SqlBricks.in('lower("title")', title),
						SqlBricks.in('lower("titlePlugin")', title)
					)
				)
				.toParams()
		)
		.then((result) => result.rows);
}
/**
 *
 * @param {Object} param
 * @param {String[]} param.idPlugin
 * @returns {Promise<{idPlugin:String,titlePlugin:String,title:String,idManga:number}[]>}
 */
async function listMangas({ idPlugin }) {
	const where = {};
	if (idPlugin) {
		where['lower("idPlugin")'] = idPlugin.toLowerCase();
	}
	return database
		.query(
			SqlBricks.select(
				'idPlugin',
				'titlePlugin',
				'"mangas"."idManga"',
				'mangas.title'
			)
				.from('mangasPlugins')
				.join('mangas')
				.on({ '"mangas"."idManga"': '"mangasPlugins"."idManga"' })
				.orderBy('idPlugin')
				.where(where)
				.toParams()
		)
		.then(({ rows }) => rows);
}

async function insertChapter({ id, title, volume, idPlugin, idManga }) {
	const a = await database
		.query(
			SqlBricks.insertInto('chapters', {
				idChapterPlugin: id,
				name: title,
				volume: volume,
				pluginId: idPlugin,
				idManga: idManga
			})
				.returning('idChapter')
				.toParams()
		)
		.catch((error) => {
			if (!error.message.includes('duplicate key')) {
				throw error;
			}
		});
	if (a?.rows) {
		return a?.rows[0];
	}
}

const MangasRepository = { listChapters, listMangas, insertChapter };
export default MangasRepository;

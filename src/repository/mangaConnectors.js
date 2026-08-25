import sql from 'sql-bricks-postgres';
import database from '../infra/database.js';

async function linkConnector({
	idManga,
	idPlugin,
	idMangaPlugin,
	titlePlugin,
}) {
	const { rows } = await database.query(
		sql
			.insertInto('mangaConnectors', {
				idManga,
				idPlugin,
				idMangaPlugin,
				titlePlugin,
			})
			.returning('idMangaConnector')
			.toParams(),
	);
	return rows[0];
}

async function findConnector({ idManga, idPlugin }) {
	const { rows } = await database.query(
		sql
			.select(
				'idMangaConnector',
				'idManga',
				'idPlugin',
				'idMangaPlugin',
				'titlePlugin',
				'isActive',
			)
			.from('mangaConnectors')
			.where({ idManga, 'lower("idPlugin")': idPlugin.toLowerCase() })
			.toParams(),
	);
	return rows[0] ?? null;
}

async function listConnectorsByManga({ idManga }) {
	const { rows } = await database.query(
		sql
			.select(
				'idMangaConnector',
				'idPlugin',
				'idMangaPlugin',
				'titlePlugin',
				'isActive',
			)
			.from('mangaConnectors')
			.where({ idManga })
			.orderBy('idPlugin')
			.toParams(),
	);
	return rows;
}

async function listActiveConnectors({ idPlugin } = {}) {
	const where = {
		'"mangaConnectors"."isActive"': true,
		'"mangas"."deletedAt"': null,
	};
	if (idPlugin) {
		where['lower("mangaConnectors"."idPlugin")'] = idPlugin.toLowerCase();
	}
	const { rows } = await database.query(
		sql
			.select(
				'"mangaConnectors"."idMangaConnector"',
				'"mangaConnectors"."idManga"',
				'"mangaConnectors"."idPlugin"',
				'"mangaConnectors"."idMangaPlugin"',
				'"mangaConnectors"."titlePlugin"',
				'"mangas"."title"',
			)
			.from('mangaConnectors')
			.join('mangas')
			.on({ '"mangas"."idManga"': '"mangaConnectors"."idManga"' })
			.where(where)
			.toParams(),
	);
	return rows;
}

async function setConnectorActive({ idManga, idPlugin, isActive }) {
	const { rows } = await database.query(
		sql
			.update('mangaConnectors', { isActive, updatedAt: new Date() })
			.where({ idManga, 'lower("idPlugin")': idPlugin.toLowerCase() })
			.returning('idMangaConnector')
			.toParams(),
	);
	return rows[0] ?? null;
}

async function deactivateAllForManga({ idManga }) {
	await database.query(
		sql
			.update('mangaConnectors', { isActive: false, updatedAt: new Date() })
			.where({ idManga })
			.toParams(),
	);
}

const MangaConnectorsRepository = {
	linkConnector,
	findConnector,
	listConnectorsByManga,
	listActiveConnectors,
	setConnectorActive,
	deactivateAllForManga,
};
export default MangaConnectorsRepository;

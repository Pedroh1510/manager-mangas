/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
	pgm.dropTable('chapters');
	pgm.dropTable('mangasPlugins');
	pgm.dropTable('historyManga');
	pgm.dropTable('mangas');

	pgm.createTable('mangas', {
		idManga: 'id',
		title: { type: 'text', notNull: true, unique: true },
		createdAt: {
			type: 'timestamp',
			notNull: true,
			default: pgm.func('current_timestamp'),
		},
		updatedAt: {
			type: 'timestamp',
			notNull: true,
			default: pgm.func('current_timestamp'),
		},
		deletedAt: { type: 'timestamp', notNull: false, default: null },
	});

	pgm.createTable(
		'mangaConnectors',
		{
			idMangaConnector: 'id',
			idManga: { type: 'integer', notNull: true, references: 'mangas' },
			idPlugin: { type: 'varchar(255)', notNull: true },
			idMangaPlugin: { type: 'text', notNull: true },
			titlePlugin: { type: 'text', notNull: true },
			isActive: { type: 'boolean', notNull: true, default: true },
			createdAt: {
				type: 'timestamp',
				notNull: true,
				default: pgm.func('current_timestamp'),
			},
			updatedAt: {
				type: 'timestamp',
				notNull: true,
				default: pgm.func('current_timestamp'),
			},
		},
		{
			constraints: {
				unique: [
					['idManga', 'idPlugin'],
					['idPlugin', 'idMangaPlugin'],
				],
			},
		},
	);

	pgm.createTable(
		'chapters',
		{
			idChapter: 'id',
			idManga: { type: 'integer', notNull: true, references: 'mangas' },
			idMangaConnector: {
				type: 'integer',
				notNull: true,
				references: 'mangaConnectors',
			},
			idChapterPlugin: { type: 'text', notNull: true },
			name: { type: 'text', notNull: true },
			volume: { type: 'NUMERIC(14,4)', notNull: true },
			downloadedAt: { type: 'timestamp', notNull: false, default: null },
			createdAt: {
				type: 'timestamp',
				notNull: true,
				default: pgm.func('current_timestamp'),
			},
		},
		{
			constraints: {
				unique: [
					['idManga', 'volume'],
					['idMangaConnector', 'idChapterPlugin'],
				],
			},
		},
	);

	pgm.createIndex('mangaConnectors', 'idManga');
	pgm.createIndex('mangaConnectors', ['idPlugin', 'isActive']);
	pgm.createIndex('chapters', 'idMangaConnector');
	pgm.createIndex('chapters', ['idManga', 'downloadedAt']);
	pgm.createIndex('mangas', 'deletedAt', { where: '"deletedAt" IS NULL' });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = () => {};

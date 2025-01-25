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
	pgm.createTable('mangas', {
		idManga: 'id',
		title: { type: 'text', nullable: false, unique: true },
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
	});

	pgm.createTable(
		'mangasPlugins',
		{
			idMangaPlugin: { type: 'id', primaryKey: true },
			idManga: { type: 'integer', nullable: false, references: 'mangas' },
			idPlugin: { type: 'varchar(255)', nullable: false },
		},
		{
			constraints: {
				unique: ['idManga', 'idPlugin'],
			},
		},
	);

	pgm.createTable(
		'chapters',
		{
			idChapter: 'id',
			name: { type: 'text', nullable: false },
			volume: { type: 'integer', nullable: false },
			pluginId: { type: 'varchar(255)', nullable: false },
			idChapterPlugin: { type: 'text', nullable: false },
			idManga: { type: 'integer', nullable: false, references: 'mangas' },
			wasDownloaded: { type: 'boolean', nullable: false, default: false },
			createdAt: {
				type: 'timestamp',
				notNull: true,
				default: pgm.func('current_timestamp'),
			},
		},
		{
			constraints: {
				unique: ['idManga', 'volume'],
			},
		},
	);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = () => {};

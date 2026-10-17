/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * Cover hash index of every catalog item and the connector suggestions
 * matched from it (cover-connector-suggestions doors 1 and 2).
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
	pgm.createTable(
		'catalogCoverHashes',
		{
			idCatalogCoverHash: 'id',
			idPlugin: { type: 'varchar(255)', notNull: true },
			idMangaPlugin: { type: 'text', notNull: true },
			coverUrl: { type: 'text', notNull: true },
			dHash: { type: 'bigint', notNull: false },
			pHash: { type: 'bigint', notNull: false },
			failureCount: { type: 'integer', notNull: true, default: 0 },
			failedAt: { type: 'timestamp', notNull: false },
			hashedAt: { type: 'timestamp', notNull: false },
		},
		{ constraints: { unique: [['idPlugin', 'idMangaPlugin']] } },
	);

	pgm.createTable(
		'coverSuggestions',
		{
			idCoverSuggestion: 'id',
			idManga: { type: 'integer', notNull: true, references: 'mangas' },
			idPlugin: { type: 'varchar(255)', notNull: true },
			idMangaPlugin: { type: 'text', notNull: true },
			titlePlugin: { type: 'text', notNull: true },
			dSimilarity: { type: 'real', notNull: true },
			pSimilarity: { type: 'real', notNull: true },
			titleSimilarity: { type: 'real', notNull: true },
			band: {
				type: 'varchar(16)',
				notNull: true,
				check: "band IN ('strong', 'possible')",
			},
			status: {
				type: 'varchar(16)',
				notNull: true,
				default: 'pending',
				check: "status IN ('pending', 'accepted', 'dismissed')",
			},
			createdAt: {
				type: 'timestamp',
				notNull: true,
				default: pgm.func('current_timestamp'),
			},
			decidedAt: { type: 'timestamp', notNull: false },
		},
		{ constraints: { unique: [['idManga', 'idPlugin', 'idMangaPlugin']] } },
	);
	pgm.createIndex('coverSuggestions', ['status', 'idManga']);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
	pgm.dropTable('coverSuggestions');
	pgm.dropTable('catalogCoverHashes');
};

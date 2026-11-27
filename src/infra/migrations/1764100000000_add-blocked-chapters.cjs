/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * A chapter of one link that discovery never records. The key is the link plus
 * the source's own chapter id, so a renamed fake chapter stays blocked and
 * another id with the same volume still enters. volume is display only.
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
	pgm.createTable(
		'blockedChapters',
		{
			idBlockedChapter: 'id',
			idMangaConnector: {
				type: 'integer',
				notNull: true,
				references: 'mangaConnectors',
				onDelete: 'CASCADE',
			},
			idChapterPlugin: { type: 'text', notNull: true },
			volume: { type: 'numeric(14,4)', notNull: true },
			reason: { type: 'text', notNull: false },
			createdAt: {
				type: 'timestamptz',
				notNull: true,
				default: pgm.func('now()'),
			},
		},
		{
			constraints: { unique: [['idMangaConnector', 'idChapterPlugin']] },
		},
	);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
	pgm.dropTable('blockedChapters');
};

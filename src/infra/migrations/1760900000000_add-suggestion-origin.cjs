/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * Why a suggestion exists, and no cover similarities for one opened by title
 * alone (alt-titles door 5). Existing rows all came from covers.
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
	pgm.addColumn('coverSuggestions', {
		origin: {
			type: 'varchar(10)',
			notNull: true,
			default: 'cover',
			check: "origin IN ('cover', 'title', 'both')",
		},
	});
	pgm.alterColumn('coverSuggestions', 'dSimilarity', { notNull: false });
	pgm.alterColumn('coverSuggestions', 'pSimilarity', { notNull: false });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
	pgm.sql(`DELETE FROM "coverSuggestions" WHERE "origin" = 'title'`);
	pgm.alterColumn('coverSuggestions', 'dSimilarity', { notNull: true });
	pgm.alterColumn('coverSuggestions', 'pSimilarity', { notNull: true });
	pgm.dropColumn('coverSuggestions', 'origin');
};

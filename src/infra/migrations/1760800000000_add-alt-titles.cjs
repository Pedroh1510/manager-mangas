/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

// Lowercase Latin letters with diacritics and their bases, the same pairs
// normalizeTitle() reduces through NFD (alt-titles door 7).
const ACCENTED =
	'àáâãäåçèéêëìíîïñòóôõöùúûüýÿāăąćĉċčďēĕėęěĝğġģĥĩīĭįĵķĺļľńņňōŏőŕŗřśŝşšţťũūŭůűųŵŷźżž';
const PLAIN =
	'aaaaaaceeeeiiiinooooouuuuyyaaaccccdeeeeegggghiiiijklllnnnooorrrssssttuuuuuuwyzzz';

/**
 * Alternative titles of a registered manga and their search form
 * (alt-titles doors 2 and 7). Existing rows get `searchTitles` from SQL
 * because a JS backfill here would also run on the GET /migrations dry run;
 * every later write recomputes it with normalizeTitle().
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
	pgm.addColumns('mangas', {
		altTitles: { type: 'text[]', notNull: true, default: '{}' },
		searchTitles: { type: 'text[]', notNull: true, default: '{}' },
	});
	pgm.sql(`UPDATE "mangas" SET "searchTitles" = ARRAY[btrim(regexp_replace(
		translate(lower("title"), '${ACCENTED}', '${PLAIN}'),
		'[^[:alnum:]]+', ' ', 'g'))]`);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
	pgm.dropColumns('mangas', ['altTitles', 'searchTitles']);
};

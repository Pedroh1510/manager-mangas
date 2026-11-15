/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

// WiComix was dropped from the registry in PR #47 (layout/paywall broke its
// parser); it comes back to the registry turned off by this switch instead.
const WICOMIX_REASON = 'site mudou layout/paywall; parser quebrado (PR #47)';

/**
 * A connector turned off for every manga at once: set disabledAt, and nothing
 * queries it until cleared. Link-level isActive stays untouched.
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
	pgm.addColumns('pluginConfig', {
		disabledAt: { type: 'timestamptz', notNull: false },
		disabledReason: { type: 'text', notNull: false },
	});
	pgm.sql(`
		UPDATE "pluginConfig" SET "disabledAt" = now(), "disabledReason" = '${WICOMIX_REASON}'
		WHERE lower("idPlugin") = 'wicomix';
		INSERT INTO "pluginConfig" ("idPlugin", "disabledAt", "disabledReason")
		SELECT 'wicomix', now(), '${WICOMIX_REASON}'
		WHERE NOT EXISTS (SELECT 1 FROM "pluginConfig" WHERE lower("idPlugin") = 'wicomix');
	`);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
	pgm.dropColumns('pluginConfig', ['disabledAt', 'disabledReason']);
};

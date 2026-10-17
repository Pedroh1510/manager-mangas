/**
 * Records structured log calls per level.
 * @example const logger = new FakeLogger(); logger.warn({ status: 'x' }); logger.warnings // [{ status: 'x' }]
 */
export default class FakeLogger {
	warnings = [];
	errors = [];

	warn(entry) {
		this.warnings.push(entry);
	}

	error(message, meta) {
		this.errors.push({ message, meta });
	}

	info() {}
}

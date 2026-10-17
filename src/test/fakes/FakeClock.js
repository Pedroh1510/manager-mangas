const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Settable clock for code that takes a `now()` dependency.
 * @example const clock = new FakeClock(0); clock.advanceDays(1); clock.now() // 86400000
 */
export default class FakeClock {
	constructor(start = Date.UTC(2026, 9, 17)) {
		this.time = start;
		this.now = () => this.time;
	}

	advanceDays(days) {
		this.time += days * DAY_MS;
	}

	advanceHours(hours) {
		this.time += hours * HOUR_MS;
	}

	daysAgo(days) {
		return new Date(this.time - days * DAY_MS);
	}

	hoursAgo(hours) {
		return new Date(this.time - hours * HOUR_MS);
	}
}

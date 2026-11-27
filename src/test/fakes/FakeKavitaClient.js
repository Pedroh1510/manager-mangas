/**
 * Scriptable Kavita client; set `failOn` to a method name to make it throw.
 * @example new FakeKavitaClient({ healthy: false }).checkHealth() // false
 */
export default class FakeKavitaClient {
	scans = [];

	constructor({
		healthy = true,
		token = 'tok',
		seriesList = [],
		failOn = null,
	} = {}) {
		this.healthy = healthy;
		this.token = token;
		this.seriesList = seriesList;
		this.failOn = failOn;
	}

	async checkHealth() {
		return this.healthy;
	}

	async authenticate() {
		return this.token;
	}

	async searchSeries() {
		return this.seriesList;
	}

	async scanSeries(params) {
		if (this.failOn === 'scanSeries') throw new Error('scan boom');
		this.scans.push(params);
	}
}

/**
 * Dependency probe that succeeds, fails or hangs on demand, counting its calls.
 * @example const probe = new FakeProbe(); probe.failWith('down'); await probe.ping() // rejects 'down'
 */
export default class FakeProbe {
	constructor() {
		this.calls = 0;
		this.behavior = () => Promise.resolve('ok');
		this.ping = () => {
			this.calls += 1;
			return this.behavior();
		};
	}

	failWith(message) {
		this.behavior = () => Promise.reject(new Error(message));
	}

	hang() {
		this.behavior = () => new Promise(() => undefined);
	}
}

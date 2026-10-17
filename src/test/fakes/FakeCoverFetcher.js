/**
 * Stands in for the cover downloader: answers each URL with the Buffer or
 * the Error it was given, and records every URL it was asked for.
 * @example const fetcher = new FakeCoverFetcher({ 'https://h/a.jpg': Buffer.from('a') });
 */
export default class FakeCoverFetcher {
	constructor(responses = {}) {
		this.responses = responses;
		this.calls = [];
	}

	download = async (url) => {
		this.calls.push(url);
		const response = this.responses[url];
		if (response instanceof Error) throw response;
		if (!response) throw new Error(`FakeCoverFetcher: no response for ${url}`);
		return response;
	};
}

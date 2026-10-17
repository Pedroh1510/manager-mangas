import http from 'node:http';
import sharp from 'sharp';

const HUGE_BODY_BYTES = 11 * 1024 * 1024;

function solidPng(width, height) {
	return sharp({
		create: { width, height, channels: 3, background: '#336699' },
	})
		.png()
		.toBuffer();
}

/**
 * Local HTTP server standing in for a connector's cover host. Serves a
 * 600x900 PNG at /cover.png (and /other.png), 404 at /404, an HTML page at
 * /html, an 11 MB body at /huge, never answers /hang, and sends one byte
 * every 50ms forever at /trickle (a socket that is never idle). Counts
 * requests per path.
 * @example const server = await FakeImageServer.start(); server.url('/cover.png')
 */
export default class FakeImageServer {
	static async start() {
		const server = new FakeImageServer(await solidPng(600, 900));
		await server.listen();
		return server;
	}

	constructor(png) {
		this.png = png;
		this.requests = new Map();
		this.hanging = [];
		this.server = http.createServer((req, res) => this.answer(req, res));
	}

	listen() {
		return new Promise((resolve) =>
			this.server.listen(0, '127.0.0.1', resolve),
		);
	}

	url(pathname) {
		return `http://127.0.0.1:${this.server.address().port}${pathname}`;
	}

	requestCount(pathname) {
		return this.requests.get(pathname) ?? 0;
	}

	totalRequests() {
		return [...this.requests.values()].reduce((sum, count) => sum + count, 0);
	}

	answer(req, res) {
		this.requests.set(req.url, this.requestCount(req.url) + 1);
		const routes = {
			'/cover.png': () =>
				res.writeHead(200, { 'content-type': 'image/png' }).end(this.png),
			'/other.png': () =>
				res.writeHead(200, { 'content-type': 'image/png' }).end(this.png),
			'/html': () =>
				res
					.writeHead(200, { 'content-type': 'text/html' })
					.end('<html></html>'),
			'/huge': () => res.writeHead(200).end(Buffer.alloc(HUGE_BODY_BYTES)),
			'/hang': () => this.hanging.push(res),
			'/trickle': () => this.trickle(res),
		};
		if (Object.prototype.hasOwnProperty.call(routes, req.url)) {
			const route = routes[req.url];
			if (typeof route === 'function') {
				route();
				return;
			}
		}
		res.writeHead(404).end();
	}

	trickle(res) {
		res.writeHead(200, { 'content-type': 'image/png' });
		const timer = setInterval(() => res.write(Buffer.alloc(1)), 50);
		res.on('close', () => clearInterval(timer));
		this.hanging.push(res);
	}

	stop() {
		for (const res of this.hanging) res.destroy();
		this.server.closeAllConnections();
		return new Promise((resolve) => this.server.close(resolve));
	}
}

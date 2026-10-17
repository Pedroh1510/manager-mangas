import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const root = join(import.meta.dirname, '../../../../..');
const START = ['node', '--import', './src/telemetry.js', 'src/server.js'];

test('the image starts node with the telemetry bootstrap and no npm wrapper', () => {
	const cmd = readFileSync(join(root, 'Dockerfile'), 'utf8')
		.split('\n')
		.find((line) => line.startsWith('CMD '));

	// npm prints a banner and `npm error` lines on SIGTERM: not JSON (AC 17)
	expect(JSON.parse(cmd.slice('CMD '.length))).toEqual(START);
});

test('npm run server starts the same command', () => {
	const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

	expect(pkg.scripts.server).toBe(START.join(' '));
});

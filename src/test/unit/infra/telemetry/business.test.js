import { afterAll, beforeAll, expect, test } from 'vitest';
import { installMeterProvider } from '../../../fakes/telemetry.js';

let meters;
let business;

beforeAll(async () => {
	meters = installMeterProvider();
	business = await import('../../../../infra/telemetry/business.js');
});

afterAll(async () => {
	await meters.uninstall();
});

test.each([
	['mangas.chapters.discovered'],
	['mangas.chapters.downloaded'],
	['mangas.images.processed'],
	['mangas.covers.hashed'],
])('each pipeline event increments its counter: %s', async (name) => {
	business.countPipelineEvent(name, { source: 'mangeek', result: 'ok' });

	const points = await meters.points(name);
	expect(points).toHaveLength(1);
	expect(points[0].attributes).toEqual({ source: 'mangeek', result: 'ok' });
	expect(points[0].value).toBe(1);
});

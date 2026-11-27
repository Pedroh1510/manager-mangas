import { describe, expect, test } from 'vitest';
import { createScanMangaSeries } from '../../../../service/kavita/scanMangaSeries.js';
import FakeKavitaClient from '../../../fakes/FakeKavitaClient.js';
import FakeLogger from '../../../fakes/FakeLogger.js';

const series = [{ name: 'Black Clover', seriesId: 3, libraryId: 1 }];

function build(options) {
	const kavita = new FakeKavitaClient(options);
	const log = new FakeLogger();
	return { kavita, log, scan: createScanMangaSeries({ kavita, log }) };
}

describe('scanMangaSeries', () => {
	test('returns false and warns when health check fails', async () => {
		const { log, scan } = build({ healthy: false, seriesList: series });
		expect(await scan({ title: 'Black Clover' })).toBe(false);
		expect(log.warnings.at(-1)).toMatchObject({
			status: 'chapter_fix_kavita_scan_failed',
			title: 'Black Clover',
			reason: 'connection_failed',
		});
	});

	test('returns false when series is not found', async () => {
		const { log, scan } = build({ seriesList: [] });
		expect(await scan({ title: 'Black Clover' })).toBe(false);
		expect(log.warnings.at(-1).reason).toBe('series_not_found');
	});

	test('returns false when scan throws', async () => {
		const { log, scan } = build({ seriesList: series, failOn: 'scanSeries' });
		expect(await scan({ title: 'Black Clover' })).toBe(false);
		expect(log.warnings.at(-1).reason).toBe('scan boom');
	});

	test('returns true and scans the matching series', async () => {
		const { kavita, scan } = build({ seriesList: series });
		expect(await scan({ title: 'Black Clover' })).toBe(true);
		expect(kavita.scans).toEqual([{ libraryId: 1, seriesId: 3, token: 'tok' }]);
	});
});

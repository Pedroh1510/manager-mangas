import { afterEach, describe, expect, test, vi } from 'vitest';
import database from '../../../infra/database.js';
import PluginConfigRepository from '../../../repository/pluginConfig.js';

vi.mock('../../../infra/database.js', () => ({
	default: { query: vi.fn() },
}));

describe('PluginConfigRepository.findPluginAccess', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('matches idPlugin case-insensitively and returns cookie and userAgent', async () => {
		database.query.mockResolvedValueOnce({
			rows: [{ cookie: 'c=1', userAgent: 'UA' }],
		});

		const access = await PluginConfigRepository.findPluginAccess({
			idPlugin: 'NexusToons',
		});

		expect(access).toEqual({ cookie: 'c=1', userAgent: 'UA' });
		const [{ text, values }] = database.query.mock.calls[0];
		expect(text).toMatch(/lower\("idPlugin"\)/);
		expect(values).toEqual(['nexustoons']);
	});

	test('returns nulls when the plugin has no config row', async () => {
		database.query.mockResolvedValueOnce({ rows: [] });

		await expect(
			PluginConfigRepository.findPluginAccess({ idPlugin: 'mangeek' }),
		).resolves.toEqual({ cookie: null, userAgent: null });
	});
});

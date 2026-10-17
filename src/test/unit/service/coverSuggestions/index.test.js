import { describe, expect, test, vi } from 'vitest';

const loadCatalogMock = vi.fn().mockResolvedValue(null);
vi.mock('../../../../utils/mangaCatalog.js', () => ({
	loadCatalog: loadCatalogMock,
}));
vi.mock('../../../../connectors/registry.js', () => ({
	listConnectorIds: vi.fn().mockReturnValue(['mangeek', 'nexustoons']),
}));
vi.mock('../../../../service/queue/coverHashQueue.js', () => ({
	getCoverHashQueue: vi.fn(),
}));
vi.mock('../../../../infra/database.js', () => ({
	default: { query: vi.fn() },
}));

const { default: CoverSuggestions } = await import(
	'../../../../service/coverSuggestions/index.js'
);

describe('CoverSuggestions wiring', () => {
	test('syncAllIndexes syncs every registered connector', async () => {
		await CoverSuggestions.syncAllIndexes();

		expect(loadCatalogMock.mock.calls.map(([id]) => id)).toEqual([
			'mangeek',
			'nexustoons',
		]);
	});
});

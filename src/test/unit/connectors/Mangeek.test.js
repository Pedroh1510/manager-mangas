import { describe, expect, test, vi } from 'vitest';
import Mangeek from '../../../infra/engines/connectors/Mangeek.mjs';

describe('Mangeek', () => {
	describe('metadata', () => {
		test('sets id, label, tags and base url', () => {
			const connector = new Mangeek();
			expect(connector.id).toBe('mangeek');
			expect(connector.label).toBe('Mangeek');
			expect(connector.tags).toEqual(['manga', 'portuguese']);
			expect(connector.url).toBe('http://geekstations.com.br');
		});
	});

	describe('_nonce', () => {
		test('returns the current timestamp as uppercase hex', () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2026-08-22T00:00:00.000Z'));

			const connector = new Mangeek();
			const nonce = connector._nonce();

			expect(nonce).toBe(Date.now().toString(16).toUpperCase());
			expect(nonce).toMatch(/^[0-9A-F]+$/);

			vi.useRealTimers();
		});
	});

	describe('_keyGen', () => {
		test('matches the request-signing formula verified against production (manga id 1968, captured live example from findings.md)', () => {
			const connector = new Mangeek();
			// GET .../manga/1A02B1EAB01/1968/2a09d4c6b42a7efee402ec4db4b6950e
			expect(connector._keyGen('1968')).toBe(
				'2a09d4c6b42a7efee402ec4db4b6950e',
			);
		});

		test('produces a different key for a different param', () => {
			const connector = new Mangeek();
			expect(connector._keyGen('278')).toBe('abbc231f460cba5f8fff4fe1f759f1ed');
			expect(connector._keyGen('278')).not.toBe(connector._keyGen('1968'));
		});
	});

	describe('_getAllTags', () => {
		test('fetches the signed home endpoint and returns its tags array', async () => {
			const connector = new Mangeek();
			const responseBody = { tags: ['Ação', 'Aventura', 'Webtoon'] };
			vi.stubGlobal(
				'fetch',
				vi
					.fn()
					.mockResolvedValue({ status: 200, json: async () => responseBody }),
			);

			const tags = await connector._getAllTags();

			expect(tags).toEqual(responseBody.tags);
			const calledRequest = fetch.mock.calls[0][0];
			const match = calledRequest.url.match(
				/\/api\/v2\/pt\/home\/([0-9A-F]+)\/([0-9a-f]{32})$/,
			);
			expect(match).not.toBeNull();
			expect(match[2]).toBe(connector._keyGen(match[1]));

			vi.unstubAllGlobals();
		});

		test('returns an empty array when the response has no tags field', async () => {
			const connector = new Mangeek();
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue({ status: 200, json: async () => ({}) }),
			);

			expect(await connector._getAllTags()).toEqual([]);

			vi.unstubAllGlobals();
		});
	});

	describe('_getMangas', () => {
		test('paginates /discover per tag, dedupes by manga id across tags, and isolates a failing tag', async () => {
			const connector = new Mangeek();
			connector._getAllTags = vi
				.fn()
				.mockResolvedValue(['Ação', 'Aventura', 'Terror']);

			const acaoPage1 = Array.from({ length: 25 }, (_, i) => ({
				id: i + 1,
				title: `Manga ${i + 1}`,
			}));
			const acaoPage2 = [{ id: 26, title: 'Manga 26' }]; // < 25 => last page for this tag
			const aventuraPage1 = [
				{ id: 1, title: 'Manga 1' }, // overlaps with Ação, must not duplicate
				{ id: 50, title: 'Manga 50' },
			];

			const fetchMock = vi.fn(async (request) => {
				const body = await request.clone().json();
				const [tag] = body.tags;
				if (tag === 'Ação') {
					return {
						status: 200,
						json: async () =>
							body.ignore.length === 0 ? acaoPage1 : acaoPage2,
					};
				}
				if (tag === 'Aventura') {
					return { status: 200, json: async () => aventuraPage1 };
				}
				if (tag === 'Terror') {
					throw new Error('network blip');
				}
				throw new Error(`unexpected tag: ${tag}`);
			});
			vi.stubGlobal('fetch', fetchMock);
			vi.useFakeTimers();

			const resultPromise = connector._getMangas();
			await vi.advanceTimersByTimeAsync(1000); // flush the wait(500) between discover pages
			const mangas = await resultPromise;

			// 26 unique from Ação (ids 1-26) + 1 new from Aventura (id 50); id 1 not duplicated
			expect(mangas).toHaveLength(27);
			expect(mangas.find((m) => m.id === '1')).toEqual({
				id: '1',
				title: 'Manga 1',
			});
			expect(mangas.find((m) => m.id === '50')).toEqual({
				id: '50',
				title: 'Manga 50',
			});
			expect(mangas.find((m) => m.id === '26')).toEqual({
				id: '26',
				title: 'Manga 26',
			});

			vi.useRealTimers();
			vi.unstubAllGlobals();
		});

		test('sends tags and an accumulating ignore list in the discover request body', async () => {
			const connector = new Mangeek();
			connector._getAllTags = vi.fn().mockResolvedValue(['Ação']);

			const bodies = [];
			const page1 = Array.from({ length: 25 }, (_, i) => ({
				id: i + 1,
				title: `M${i + 1}`,
			}));
			const page2 = [{ id: 26, title: 'M26' }];
			let call = 0;
			const fetchMock = vi.fn(async (request) => {
				bodies.push(await request.clone().json());
				call += 1;
				return { status: 200, json: async () => (call === 1 ? page1 : page2) };
			});
			vi.stubGlobal('fetch', fetchMock);
			vi.useFakeTimers();

			const resultPromise = connector._getMangas();
			await vi.advanceTimersByTimeAsync(1000);
			await resultPromise;

			expect(bodies[0]).toEqual({ tags: ['Ação'], ignore: [] });
			expect(bodies[1]).toEqual({
				tags: ['Ação'],
				ignore: page1.map((m) => m.id),
			});
			expect(fetchMock.mock.calls[0][0].headers.get('content-type')).toBe(
				'application/json',
			);

			vi.useRealTimers();
			vi.unstubAllGlobals();
		});
	});

	describe('_getChapters', () => {
		test('maps the manga detail response into id/title/language chapter objects', async () => {
			const connector = new Mangeek();
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue({
					status: 200,
					json: async () => ({
						id: 1968,
						title: 'The Great Mage Returns After 4000 Years',
						chapters: [
							{ id: 171705, title: 'Capítulo 01' },
							{ id: 171706, title: 'Capítulo 02' }
						]
					})
				})
			);

			const chapters = await connector._getChapters({ id: '1968' });

			expect(chapters).toEqual([
				{ id: '171705', title: 'Capítulo 01', language: 'pt' },
				{ id: '171706', title: 'Capítulo 02', language: 'pt' }
			]);
			const calledRequest = fetch.mock.calls[0][0];
			const match = calledRequest.url.match(
				/\/api\/v2\/pt\/manga\/([0-9A-F]+)\/1968\/([0-9a-f]{32})$/
			);
			expect(match).not.toBeNull();
			expect(match[2]).toBe(connector._keyGen('1968'));

			vi.unstubAllGlobals();
		});

		test('returns an empty array when the response has no chapters field', async () => {
			const connector = new Mangeek();
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue({
					status: 200,
					json: async () => ({ id: 1968, title: 'X' })
				})
			);

			expect(await connector._getChapters({ id: '1968' })).toEqual([]);

			vi.unstubAllGlobals();
		});
	});
});

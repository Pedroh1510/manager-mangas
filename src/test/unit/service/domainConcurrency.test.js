import { afterEach, describe, expect, test, vi } from 'vitest';
import CONFIG_ENV from '../../../infra/env.js';
import { withDomainSlot } from '../../../service/domainConcurrency.js';

describe('domainConcurrency', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('runs the task and returns its result', async () => {
		const result = await withDomainSlot(
			'https://a.example/1.jpg',
			async () => 'ok',
		);

		expect(result).toBe('ok');
	});

	test('releases the slot even when the task throws', async () => {
		await expect(
			withDomainSlot('https://b.example/1.jpg', async () => {
				throw new Error('boom');
			}),
		).rejects.toThrow('boom');

		// slot released means a second call resolves without hanging
		const result = await withDomainSlot(
			'https://b.example/2.jpg',
			async () => 'ok',
		);
		expect(result).toBe('ok');
	});

	test('caps concurrent tasks per domain at CONFIG_ENV.CONCURRENCY', async () => {
		CONFIG_ENV.CONCURRENCY = 2;
		const domain = 'https://c.example';
		let active = 0;
		let maxActive = 0;

		const task = async () => {
			active++;
			maxActive = Math.max(maxActive, active);
			await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
			active--;
		};

		await Promise.all(
			Array.from({ length: 5 }, (_, i) =>
				withDomainSlot(`${domain}/${i}.jpg`, task),
			),
		);

		expect(maxActive).toBeLessThanOrEqual(2);
	});

	test('does not let one domain block another domain', async () => {
		CONFIG_ENV.CONCURRENCY = 1;
		let blockedRelease;
		const blocked = new Promise((resolvePromise) => {
			blockedRelease = resolvePromise;
		});

		const blockedTask = withDomainSlot(
			'https://d.example/1.jpg',
			() => blocked,
		);
		const otherResult = await withDomainSlot(
			'https://e.example/1.jpg',
			async () => 'free',
		);

		expect(otherResult).toBe('free');
		blockedRelease();
		await blockedTask;
	});
});

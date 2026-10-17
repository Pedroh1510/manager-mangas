import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import {
	dHash,
	hashCoverImage,
	pHash,
	similarity,
	thresholdBits,
} from '../../../../service/coverSuggestions/hashing.js';

const ALL_ONES = 0xffffffffffffffffn;

function greyImage(width, height, pixelAt) {
	const pixels = Buffer.alloc(width * height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) pixels[y * width + x] = pixelAt(x, y);
	}
	return sharp(pixels, { raw: { width, height, channels: 1 } })
		.png()
		.toBuffer();
}

// Deterministic 600x900 cover-like patterns. A pure linear ramp leaves almost
// every DCT coefficient at zero, which no real cover does, so the gradient
// carries a slow vertical wave as texture.
const PATTERNS = {
	gradient: (x, y) =>
		Math.round((x / 599) * 140 + (y / 899) * 60 + 25 * Math.sin(y / 70)),
	// Squares off the 32x32 grid and shaded: an aligned, flat checkerboard is
	// symmetric enough to zero most coefficients, the same trap as the ramp.
	checkerboard: (x, y) =>
		(Math.floor((x + 37) / 110) + Math.floor((y + 53) / 130)) % 2 === 0
			? 30 + Math.round((y / 899) * 50)
			: 190 + Math.round((x / 599) * 50),
	// Off-centre for the same reason: a centred disc zeroes every odd
	// horizontal frequency.
	circle: (x, y) => {
		const distance = Math.hypot(x - 230, y - 380);
		return distance < 220
			? 230 - Math.round(distance / 4)
			: 20 + Math.round((y / 899) * 30);
	},
};

const patternImage = (name) => greyImage(600, 900, PATTERNS[name]);

async function recompressAndHalve(image) {
	return sharp(image).resize({ width: 300 }).jpeg({ quality: 60 }).toBuffer();
}

describe('cover hashing', () => {
	test('dHash sets a bit when the left pixel is brighter', async () => {
		const decreasing = await greyImage(9, 8, (x) => 240 - x * 25);
		const increasing = await greyImage(9, 8, (x) => 10 + x * 25);

		expect(BigInt.asUintN(64, await dHash(decreasing))).toBe(ALL_ONES);
		expect(await dHash(increasing)).toBe(0n);
	});

	test('pHash thresholds the low frequency DCT at the median without DC', async () => {
		const uniform = await greyImage(32, 32, () => 128);
		// Bright on the left: the first horizontal frequency is strongly positive,
		// the first vertical one is zero.
		const gradient = await greyImage(32, 32, (x) => 250 - x * 7);

		expect(await pHash(uniform)).toBe(await pHash(uniform));
		const bits = BigInt.asUintN(64, await pHash(gradient));
		const bitAt = (row, col) => (bits >> BigInt(63 - (row * 8 + col))) & 1n;
		expect(bitAt(0, 1)).toBe(1n);
		expect(bitAt(1, 0)).toBe(0n);
	});

	test('pHash leaves the DC term out of the median', () => {
		// 32 zeros and 31 ones after DC: without DC the median is 0, so every
		// 1 is set; with DC in the median it would be 1 and none of them would.
		const coefficients = [1000, ...Array(32).fill(0), ...Array(31).fill(1)];
		const expected = BigInt.asIntN(64, (1n << 63n) | ((1n << 31n) - 1n));

		expect(thresholdBits(coefficients)).toBe(expected);
	});

	test('is deterministic', async () => {
		const image = await patternImage('circle');

		const first = await hashCoverImage(image);
		const second = await hashCoverImage(image);

		expect(second).toEqual(first);
	});

	test('tolerates recompression and resize', async () => {
		for (const name of Object.keys(PATTERNS)) {
			const original = await hashCoverImage(await patternImage(name));
			const altered = await hashCoverImage(
				await recompressAndHalve(await patternImage(name)),
			);

			expect(
				similarity(original.dHash, altered.dHash),
				`${name} dHash`,
			).toBeGreaterThanOrEqual(0.9);
			expect(
				similarity(original.pHash, altered.pHash),
				`${name} pHash`,
			).toBeGreaterThanOrEqual(0.9);
		}
	});

	test('separates distinct images', async () => {
		const pairs = [
			['gradient', 'checkerboard'],
			['gradient', 'circle'],
			['checkerboard', 'circle'],
		];
		for (const [a, b] of pairs) {
			const first = await hashCoverImage(await patternImage(a));
			const second = await hashCoverImage(await patternImage(b));

			expect(
				similarity(first.dHash, second.dHash),
				`${a}x${b} dHash`,
			).toBeLessThan(0.8);
			expect(
				similarity(first.pHash, second.pHash),
				`${a}x${b} pHash`,
			).toBeLessThan(0.8);
		}
	});

	test('similarity is one minus hamming over 64', () => {
		expect(similarity(0n, 0n)).toBe(1);
		expect(similarity(0n, ALL_ONES)).toBe(0);
		expect(similarity(0n, 0b111n)).toBe(61 / 64);
		expect(similarity(BigInt.asIntN(64, 0n), BigInt.asIntN(64, ALL_ONES))).toBe(
			0,
		);
		expect(
			similarity(
				BigInt.asIntN(64, 1n << 63n),
				BigInt.asIntN(64, 0b111n << 61n),
			),
		).toBe(similarity(1n << 63n, 0b111n << 61n));
	});
});

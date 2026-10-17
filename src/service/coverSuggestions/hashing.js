import sharp from 'sharp';

const HASH_BITS = 64;
const DHASH_WIDTH = 9;
const DHASH_HEIGHT = 8;
const PHASH_SIZE = 32;
const PHASH_LOW = 8;
// Rounds float noise of the DCT (~1e-12 on flat rows) to zero, so a
// coefficient that is analytically zero never beats the median by accident.
const DCT_PRECISION = 1e6;

async function greyPixels(image, width, height) {
	const { data, info } = await sharp(image)
		.removeAlpha()
		.greyscale()
		.resize(width, height, { fit: 'fill' })
		.raw()
		.toBuffer({ resolveWithObject: true });
	return (x, y) => data[(y * width + x) * info.channels];
}

// Bit i (0 = most significant) of the 64; stored signed to fit a Postgres
// bigint (cover-connector-suggestions door 3).
function bitsToHash(bits) {
	let hash = 0n;
	for (const bit of bits) hash = (hash << 1n) | (bit ? 1n : 0n);
	return BigInt.asIntN(HASH_BITS, hash);
}

/**
 * 64-bit difference hash: greyscale 9x8, bit set when a pixel is brighter
 * than its right neighbour.
 * @example await dHash(pngBuffer) // -1234567890123456789n
 * @param {Buffer} image
 * @returns {Promise<bigint>}
 */
export async function dHash(image) {
	const pixel = await greyPixels(image, DHASH_WIDTH, DHASH_HEIGHT);
	const bits = [];
	for (let y = 0; y < DHASH_HEIGHT; y++) {
		for (let x = 0; x < DHASH_WIDTH - 1; x++) {
			bits.push(pixel(x, y) > pixel(x + 1, y));
		}
	}
	return bitsToHash(bits);
}

const COSINES = Array.from({ length: PHASH_LOW }, (_, frequency) =>
	Array.from({ length: PHASH_SIZE }, (_, position) =>
		Math.cos(((2 * position + 1) * frequency * Math.PI) / (2 * PHASH_SIZE)),
	),
);

function dctCoefficient(pixel, row, col) {
	let sum = 0;
	for (let y = 0; y < PHASH_SIZE; y++) {
		for (let x = 0; x < PHASH_SIZE; x++) {
			sum += pixel(x, y) * COSINES[row][y] * COSINES[col][x];
		}
	}
	return Math.round(sum * DCT_PRECISION) / DCT_PRECISION;
}

function median(values) {
	const sorted = values.toSorted((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
}

/**
 * 64-bit perceptual hash: 2D DCT of greyscale 32x32, the 8x8 lowest
 * frequencies (row = vertical, col = horizontal) thresholded at their median,
 * the DC term left out of the median.
 * @example await pHash(pngBuffer) // 42n
 * @param {Buffer} image
 * @returns {Promise<bigint>}
 */
export async function pHash(image) {
	const pixel = await greyPixels(image, PHASH_SIZE, PHASH_SIZE);
	const coefficients = [];
	for (let row = 0; row < PHASH_LOW; row++) {
		for (let col = 0; col < PHASH_LOW; col++) {
			coefficients.push(dctCoefficient(pixel, row, col));
		}
	}
	const threshold = median(coefficients.slice(1));
	return bitsToHash(coefficients.map((value) => value > threshold));
}

/**
 * Both hashes of one cover image.
 * @example const { dHash, pHash } = await hashCoverImage(webpBuffer);
 * @param {Buffer} image
 * @returns {Promise<{dHash: bigint, pHash: bigint}>}
 */
export async function hashCoverImage(image) {
	const [d, p] = await Promise.all([dHash(image), pHash(image)]);
	return { dHash: d, pHash: p };
}

function popCount(value) {
	let count = 0;
	let rest = value;
	while (rest) {
		count += Number(rest & 1n);
		rest >>= 1n;
	}
	return count;
}

/**
 * Share of equal bits between two 64-bit hashes, signed or not.
 * @example similarity(0n, 0b111n) // 61/64
 * @param {bigint} a
 * @param {bigint} b
 * @returns {number}
 */
export function similarity(a, b) {
	const distance = popCount(BigInt.asUintN(HASH_BITS, a ^ b));
	return 1 - distance / HASH_BITS;
}

/**
 * Largest Hamming distance whose similarity still reaches `minSimilarity`.
 * @example maxDistanceFor(0.8) // 12
 * @param {number} minSimilarity
 * @returns {number}
 */
export function maxDistanceFor(minSimilarity) {
	return Math.floor(HASH_BITS * (1 - minSimilarity) + 1e-9);
}

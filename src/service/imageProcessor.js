import sharp from 'sharp';
import CONFIG_ENV from '../infra/env.js';
import logger from '../infra/logger.js';
import { detectImageExtension } from '../utils/imageFormat.js';
import { createConcurrencyLimiter } from './concurrencyLimiter.js';

// One libvips thread per encode: concurrency is capped by the limiter below,
// otherwise every parallel encode spawns a pool sized to the host's cores.
sharp.concurrency(1);
// The operation cache only pays off when the same input is re-read; pages
// are encoded once, so it just holds memory.
sharp.cache(false);

const TARGET_FORMAT = 'webp';
const TARGET_QUALITY = 100;
// WebP's hard limit is 16383 px per side; taller strips fail after a full decode.
const MAX_ENCODABLE_HEIGHT = 16383;
const ALREADY_COMPACT_EXTENSIONS = new Set(['webp', 'avif']);

function keepOriginal(image, extension) {
	return { imageFormatted: image, type: extension };
}

async function isTooTallToEncode(image) {
	const { height } = await sharp(image).metadata();
	return height > MAX_ENCODABLE_HEIGHT;
}

async function encodeOrKeep(image, extension) {
	try {
		if (await isTooTallToEncode(image)) return keepOriginal(image, extension);
		const imageFormatted = await sharp(image)
			.toFormat(TARGET_FORMAT, { quality: TARGET_QUALITY })
			.toBuffer();
		return { imageFormatted, type: TARGET_FORMAT };
	} catch (error) {
		logger.warn({
			format: TARGET_FORMAT,
			error: error.message,
			status: 'conversao_falhou',
		});
		return keepOriginal(image, extension);
	}
}

/**
 * Builds a page converter. Encodes to WebP through a process-wide limiter,
 * or keeps the original bytes when conversion is off, the source is already
 * WebP/AVIF, or it is too tall to encode.
 * @example const convert = createImageConverter({ isEnabled: true, concurrency: 2 });
 * @param {{ isEnabled: boolean, concurrency: number }} options
 * @returns {(image: Buffer) => Promise<{ imageFormatted: Buffer, type: string }>}
 */
export function createImageConverter({ isEnabled, concurrency }) {
	const runLimited = createConcurrencyLimiter(concurrency);
	return async function convert(image) {
		const extension = detectImageExtension(image);
		if (!isEnabled || ALREADY_COMPACT_EXTENSIONS.has(extension)) {
			return keepOriginal(image, extension);
		}
		return runLimited(() => encodeOrKeep(image, extension));
	};
}

export const convertImage = createImageConverter({
	isEnabled: CONFIG_ENV.IMAGE_CONVERSION_ENABLED,
	concurrency: CONFIG_ENV.IMAGE_CONVERSION_CONCURRENCY,
});

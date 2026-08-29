import sharp from 'sharp';
import logger from '../infra/logger.js';

// avif compresses smaller than webp but is more prone to sharp/libvips
// encoding failures depending on source image shape/format — kept first
// with a real fallback instead of silently producing avif-labeled webp data.
const FORMAT_CHAIN = ['avif', 'webp'];
const QUALITY_BY_FORMAT = { avif: 60, webp: 80 };

async function encode(image, format) {
	return sharp(image)
		.toFormat(format, { quality: QUALITY_BY_FORMAT[format] })
		.toBuffer();
}

/**
 * Converts an image buffer trying each format in FORMAT_CHAIN in order,
 * falling back to the original buffer (labeled png) if every format fails.
 */
export async function convertImage(image) {
	for (const format of FORMAT_CHAIN) {
		try {
			const imageFormatted = await encode(image, format);
			return { imageFormatted, type: format };
		} catch (error) {
			logger.warn({ format, error: error.message, status: 'conversao_falhou' });
		}
	}
	return { imageFormatted: image, type: 'png' };
}

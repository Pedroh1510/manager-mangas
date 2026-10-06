const FALLBACK_EXTENSION = 'png';

function hasBytesAt(buffer, offset, bytes) {
	return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function hasAsciiAt(buffer, offset, text) {
	return buffer.toString('latin1', offset, offset + text.length) === text;
}

const SIGNATURES = [
	{ extension: 'jpg', matches: (b) => hasBytesAt(b, 0, [0xff, 0xd8, 0xff]) },
	{
		extension: 'png',
		matches: (b) => hasBytesAt(b, 0, [0x89, 0x50, 0x4e, 0x47]),
	},
	{ extension: 'gif', matches: (b) => hasAsciiAt(b, 0, 'GIF8') },
	{
		extension: 'webp',
		matches: (b) => hasAsciiAt(b, 0, 'RIFF') && hasAsciiAt(b, 8, 'WEBP'),
	},
	{
		extension: 'avif',
		matches: (b) =>
			hasAsciiAt(b, 4, 'ftyp') &&
			(hasAsciiAt(b, 8, 'avif') || hasAsciiAt(b, 8, 'avis')),
	},
];

/**
 * File extension for an image buffer, read from its magic bytes without
 * decoding it. Unknown signatures fall back to 'png', the label this service
 * always used for images it could not convert.
 * @example detectImageExtension(jpegBuffer) // 'jpg'
 * @param {Buffer} buffer
 * @returns {'jpg' | 'png' | 'gif' | 'webp' | 'avif'}
 */
export function detectImageExtension(buffer) {
	const signature = SIGNATURES.find(({ matches }) => matches(buffer));
	return signature?.extension ?? FALLBACK_EXTENSION;
}

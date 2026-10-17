import fs from 'node:fs/promises';
import path from 'node:path';

function isMissing(error) {
	return error.code === 'ENOENT';
}

/**
 * Filesystem store for cover files. Writes go through a temp file and a
 * rename, so a concurrent reader sees the old bytes or the new, never half.
 * @example await coverStore.read('/app/appdata/covers/7.webp') // Buffer or null
 */
export const coverStore = {
	async read(filePath) {
		try {
			return await fs.readFile(filePath);
		} catch (error) {
			if (isMissing(error)) return null;
			throw error;
		}
	},

	async write(filePath, image) {
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		const tmpPath = `${filePath}.${process.pid}.tmp`;
		await fs.writeFile(tmpPath, image);
		await fs.rename(tmpPath, filePath);
	},

	async remove(filePath) {
		await fs.rm(filePath, { force: true });
	},
};

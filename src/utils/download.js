import axios from 'axios';
import { createWriteStream } from 'node:fs';

export async function downloadImage({ url, path }) {
	const writer = createWriteStream(path);

	const response = await axios({
		url,
		method: 'GET',
		responseType: 'stream'
	});

	response.data.pipe(writer);

	return new Promise((resolve, reject) => {
		writer.on('finish', resolve);
		writer.on('error', reject);
	});
}

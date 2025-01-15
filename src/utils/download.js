import axios from 'axios';
import { createWriteStream } from 'node:fs';

export async function downloadImage({ url }) {
	return axios({
		url,
		method: 'GET',
		responseType: 'arraybuffer'
	}).then(({ data }) => Buffer.from(data, 'base64'));
}

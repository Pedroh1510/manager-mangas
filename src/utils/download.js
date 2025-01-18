import axios from 'axios';

export async function downloadImage({ url }) {
	return axios({
		url,
		method: 'GET',
		responseType: 'arraybuffer',
		headers: {
			referer: new URL(url).origin
		}
	}).then(({ data }) => Buffer.from(data, 'base64'));
}

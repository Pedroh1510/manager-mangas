import axios from 'axios';

export async function downloadImage({ url,cookie }) {
	return axios({
		url,
		method: 'GET',
		responseType: 'arraybuffer',
		headers: {
			referer: new URL(url).origin,
			cookie,
			"User-Agent":'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
		},
	}).then(({ data }) => Buffer.from(data, 'base64'));
}

import axios from 'axios';

export async function downloadImage({ url, cookie, userAgent }) {
	return axios({
		url,
		method: 'GET',
		responseType: 'arraybuffer',
		headers: {
			referer: new URL(url).origin,
			cookie,
			'User-Agent':
				userAgent ??
				'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:129.0) Gecko/20100101 Firefox/129.0'
		}
	}).then(({ data }) => Buffer.from(data, 'base64'));
}

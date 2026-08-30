import axios from 'axios';
import CONFIG_ENV from './env.js';

const http = axios.create({ baseURL: CONFIG_ENV.KAVITA_URL });

async function checkHealth() {
	try {
		const response = await http({ method: 'get', url: '/api/health' });
		return response.status === 200;
	} catch {
		return false;
	}
}

async function authenticate() {
	try {
		const response = await http({
			method: 'post',
			url: '/api/plugin/authenticate',
			params: { apiKey: CONFIG_ENV.KAVITA_API_KEY, pluginName: 'manager-mangas' },
		});
		return response.data?.token ?? null;
	} catch {
		return null;
	}
}

async function searchSeries({ title, token }) {
	const response = await http({
		method: 'get',
		url: '/api/search/search',
		params: { queryString: title, includeChapterAndFiles: false },
		headers: { Authorization: `Bearer ${token}` },
	});
	return response.data?.series ?? [];
}

async function getSeriesVolumes({ seriesId, token }) {
	const response = await http({
		method: 'get',
		url: '/api/series/volumes',
		params: { seriesId },
		headers: { Authorization: `Bearer ${token}` },
	});
	return response.data ?? [];
}

async function scanSeries({ libraryId, seriesId, token }) {
	await http({
		method: 'post',
		url: '/api/series/scan',
		data: { libraryId, seriesId },
		headers: { Authorization: `Bearer ${token}` },
	});
}

const KavitaClient = {
	checkHealth,
	authenticate,
	searchSeries,
	getSeriesVolumes,
	scanSeries,
};
export default KavitaClient;

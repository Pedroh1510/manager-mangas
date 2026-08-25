import api from '../../../../infra/api.js';

export default class AdmUtils {
	async createManga({ title }) {
		return api
			.post('/mangas/adm', { title: title ?? 'teste' })
			.catch((error) => ({
				status: error.status,
				data: error.response?.data,
			}));
	}

	async linkConnector({ idManga, idPlugin, idMangaPlugin, titlePlugin }) {
		return api
			.post(`/mangas/adm/${idManga}/connectors`, {
				idPlugin: idPlugin ?? 'test-fixture',
				idMangaPlugin: idMangaPlugin ?? '1',
				titlePlugin: titlePlugin ?? 'teste',
			})
			.catch((error) => ({
				status: error.status,
				data: error.response?.data,
			}));
	}
}

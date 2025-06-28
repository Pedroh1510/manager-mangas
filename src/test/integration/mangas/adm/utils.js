import api from '../../../../infra/api.js';

export default class AdmUtils {
	async registerManga(manga) {
		const response = await api
			.post('/mangas/adm', {
				title: manga?.title ?? 'teste',
				idPlugin: manga.idPlugin ?? 'seitacelestial'
			})
			.catch((error) => ({
				status: error.status,
				data: error.response?.data
			}));
		return response;
	}
}

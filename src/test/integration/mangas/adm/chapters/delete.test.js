import { beforeAll, describe, expect, test } from 'vitest';
import api from '../../../../../infra/api.js';
import orchestrator from '../../../../orchestrator.js';

let blackClover;

beforeAll(async () => {
	await orchestrator.waitForAllServices();
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
	({ blackClover } = await orchestrator.seedDatabase());
	await orchestrator.seedDownload();
});

describe('DELETE /mangas/adm/:idManga/chapters/:idChapter', () => {
	test('OK', async () => {
		const { data: chapters } = await api.get(`/mangas/adm/${blackClover.idManga}/chapters`);
		const chapter376 = chapters.find((chapter) => Number(chapter.volume) === 376);

		const response = await api.delete(
			`/mangas/adm/${blackClover.idManga}/chapters/${chapter376.idChapter}`,
		);
		expect(response.status).toBe(200);
	});
});

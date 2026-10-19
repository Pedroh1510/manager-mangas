import { NotFoundError } from '../infra/errors.js';
import MangaConnectorsRepository from '../repository/mangaConnectors.js';
import MangasRepository from '../repository/mangas.js';
import { cleanAltTitles } from '../utils/altTitles.js';
import { loadCatalog } from '../utils/mangaCatalog.js';
import { enqueueBackgroundTask } from './queue/backgroundQueue.js';

const matchMangaJob = (idManga) => [
	'matchMangaSuggestions',
	{ idManga },
	`match-manga-${idManga}`,
];

/**
 * Builds the service that keeps `mangas.altTitles` in step with links,
 * admin edits and the one-off backfill (alt-titles S2).
 * @example await createAltTitlesService(deps).mergeFromLink({ idManga: 1, idPlugin: 'nexustoons', idMangaPlugin: 'solo', titlePlugin: 'Solo' })
 */
export function createAltTitlesService({
	mangas,
	links,
	loadCatalog,
	enqueue,
}) {
	async function findLiveManga(idManga) {
		const manga = await mangas.findMangaById({ idManga });
		if (!manga || manga.deletedAt) {
			throw new NotFoundError({
				message: `Manga ${idManga} not found`,
				action: 'Check idManga',
			});
		}
		return manga;
	}

	async function linkedTitles({ idPlugin, idMangaPlugin, titlePlugin }) {
		const catalog = (await loadCatalog(idPlugin)) ?? [];
		const item = catalog.find(({ id }) => String(id) === idMangaPlugin);
		return [titlePlugin, ...(item?.altTitles ?? [])];
	}

	// Only the linked item's titles are merged, never the other links', so a
	// title the admin removed comes back only from a new link (grilling Q5).
	async function mergeTitles(link) {
		const manga = await findLiveManga(link.idManga);
		const current = manga.altTitles ?? [];
		const merged = cleanAltTitles(manga.title, [
			...current,
			...(await linkedTitles(link)),
		]);
		if (merged.length === current.length) return false;
		await mangas.updateAltTitles({
			idManga: manga.idManga,
			title: manga.title,
			altTitles: merged,
		});
		return true;
	}

	async function mergeFromLink(link) {
		if (await mergeTitles(link)) await enqueue(...matchMangaJob(link.idManga));
	}

	async function replace({ idManga, altTitles }) {
		const manga = await findLiveManga(idManga);
		const cleaned = cleanAltTitles(manga.title, altTitles);
		await mangas.updateAltTitles({
			idManga,
			title: manga.title,
			altTitles: cleaned,
		});
		await enqueue(...matchMangaJob(idManga));
		return { idManga, title: manga.title, altTitles: cleaned };
	}

	async function backfill({ idPlugin }) {
		for (const link of await links.listLinksByPlugin({ idPlugin })) {
			await mergeTitles(link);
		}
		await enqueue('matchCoverSuggestions', {}, 'match-after-alt-backfill');
	}

	return { mergeFromLink, replace, backfill };
}

const AltTitlesService = createAltTitlesService({
	mangas: MangasRepository,
	links: MangaConnectorsRepository,
	loadCatalog: (idPlugin) => loadCatalog(idPlugin),
	enqueue: (...job) => enqueueBackgroundTask(...job),
});
export default AltTitlesService;

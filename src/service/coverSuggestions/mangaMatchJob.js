/**
 * Background job body that re-matches one manga with its current titles,
 * enqueued whenever its alternative titles change (alt-titles AC 24, AC 34).
 * @example await createMangaMatchJob(deps)({ idManga: 7 })
 */
export function createMangaMatchJob({ findMangaById, matchManga }) {
	return async function matchMangaSuggestions({ idManga }) {
		const manga = await findMangaById({ idManga });
		// The manga can be deleted between the enqueue and the run.
		if (!manga || manga.deletedAt) return [];
		return matchManga({
			idManga,
			title: manga.title,
			altTitles: manga.altTitles ?? [],
		});
	};
}

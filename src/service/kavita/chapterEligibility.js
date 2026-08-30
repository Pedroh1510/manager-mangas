export function flattenKavitaChapters(volumes) {
	return volumes.flatMap((volume) => volume.chapters ?? []);
}

function sameChapterNumber(localVolume, kavitaMinNumber) {
	return Number(localVolume).toFixed(4) === Number(kavitaMinNumber).toFixed(4);
}

function isFullyRead(kavitaChapter) {
	return kavitaChapter.pages > 0 && kavitaChapter.pagesRead >= kavitaChapter.pages;
}

function findKavitaChapter({ volume, kavitaChapters }) {
	return (
		kavitaChapters.find((chapter) => sameChapterNumber(volume, chapter.minNumber)) ??
		null
	);
}

export function selectChaptersToDelete({ localChapters, kavitaChapters }) {
	const fullyReadChapters = localChapters.filter((chapter) => {
		if (!chapter.downloadedAt) return false;
		const kavitaChapter = findKavitaChapter({
			volume: chapter.volume,
			kavitaChapters,
		});
		return kavitaChapter !== null && isFullyRead(kavitaChapter);
	});
	if (fullyReadChapters.length === 0) return [];

	const highestVolume = Math.max(
		...fullyReadChapters.map((chapter) => Number(chapter.volume)),
	);
	return fullyReadChapters.filter(
		(chapter) => Number(chapter.volume) !== highestVolume,
	);
}

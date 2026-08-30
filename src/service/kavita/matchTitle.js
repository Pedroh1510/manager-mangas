export function normalizeTitle(title) {
	return title
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.trim()
		.replace(/\s+/g, ' ');
}

export function findMatchingSeries({ title, seriesList }) {
	const normalizedTitle = normalizeTitle(title);
	const match = seriesList.find(
		(series) => normalizeTitle(series.name) === normalizedTitle,
	);
	return match ?? null;
}

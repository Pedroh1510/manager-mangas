// The site is a Next.js App Router app: the work and its full chapter list
// only exist in the React flight payload pushed through `self.__next_f`; the
// visible chapter list in the DOM is truncated (plan assumption "leitura do RSC").
const FLIGHT_CHUNK = /self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g;
// A row is `<hexId>:<json>`; text rows (`<id>:T<len>,…`) carry no trailing
// newline, so the next row can start mid-line right after one.
const FLIGHT_ROW_START = /(?<![0-9a-zA-Z])([0-9a-f]+):(?=[[{])/g;
// Chapter objects are flat and always open with id then number.
const CHAPTER_OBJECT = /\{"id":"[^"]+","number":[^{}]*\}/g;

/**
 * Reads the comic row and every chapter object of a `/manga/{slug}` page.
 * `comic` is null when no row carries that slug and a `chapter_count`.
 * @example readComicPage(html, 'um-verao-sem-fim').comic.title // 'Um Verão Sem Fim'
 * @param {string} html
 * @param {string} slug
 * @returns {{comic: {title: string, type: string, coverUrl: string, altTitles: string[]} | null, chapters: object[]}}
 */
export function readComicPage(html, slug) {
	const flight = readFlightText(html);
	const rows = readFlightRows(flight);
	return { comic: findComic(rows, slug), chapters: readChapterObjects(flight) };
}

function readFlightText(html) {
	return [...html.matchAll(FLIGHT_CHUNK)]
		.map(([, chunk]) => JSON.parse(chunk))
		.filter(([kind, text]) => kind === 1 && typeof text === 'string')
		.map(([, text]) => text)
		.join('');
}

function readFlightRows(flight) {
	const rows = new Map();
	for (const line of flight.split('\n')) {
		const row = findRowInLine(line);
		if (row) rows.set(row.id, row.value);
	}
	return rows;
}

function findRowInLine(line) {
	for (const match of line.matchAll(FLIGHT_ROW_START)) {
		const value = parseJson(line.slice(match.index + match[0].length));
		if (value !== null) return { id: match[1], value };
	}
	return null;
}

function findComic(rows, slug) {
	for (const row of rows.values()) {
		if (row?.slug === slug && 'chapter_count' in row) return toComic(row, rows);
	}
	return null;
}

function toComic(row, rows) {
	return {
		title: row.title,
		type: row.type,
		coverUrl: row.cover_url ?? row.cover ?? '',
		altTitles: resolveAltTitles(row.title_alt, rows),
	};
}

// `title_alt` is either inline or a `$<rowId>` reference to another row.
function resolveAltTitles(titleAlt, rows) {
	const value =
		typeof titleAlt === 'string' && titleAlt.startsWith('$')
			? rows.get(titleAlt.slice(1))
			: titleAlt;
	return Array.isArray(value) ? value.filter((t) => typeof t === 'string') : [];
}

function readChapterObjects(flight) {
	const byId = new Map();
	for (const [raw] of flight.matchAll(CHAPTER_OBJECT)) {
		const chapter = parseJson(raw);
		if (chapter?.slug && !byId.has(chapter.id)) byId.set(chapter.id, chapter);
	}
	return [...byId.values()];
}

function parseJson(raw) {
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

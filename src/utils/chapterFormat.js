export function formatChapters(chapters) {
	return chapters
		.filter((chapter) => ['pt', 'pt-br'].includes(chapter.language))
		.map((chapter) => {
			const a = chapter.title;
			const q = a.match(/([0-9]*[.])?[0-9]+/);
			chapter.volume = q?.length ? Number.parseInt(q[0]) : null;
			if (chapter.volume === null || Number.isNaN(chapter.volume)) {
				chapter.volume = null;
			}
			if (
				chapter.volume === null &&
				chapter.title.includes('Vol.') &&
				chapter.title.includes('Ch.')
			) {
				const titleOnlyVolCh = chapter.title.replace(/(?:(?![\d|\.]).)/g, '');
				const titleArray = titleOnlyVolCh
					.split('.')
					.filter((item) => item.trim());
				let volume = titleArray.join('');
				if (titleArray.length > 2) {
					volume = titleArray.slice(0, 2).join('');
					volume += `.${titleArray.slice(2).join()}`;
				}
				chapter.volume = Number.parseFloat(volume);
			}
			if (chapter.volume === null || Number.isNaN(chapter.volume)) {
				chapter.volume = null;
			}
			return chapter;
		})
		.filter(
			(chapter) =>
				!(
					chapter.volume === undefined ||
					chapter.volume === null ||
					chapter.volume === ''
				),
		);
}

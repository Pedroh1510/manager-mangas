import { load } from 'cheerio';

/**
 * @typedef {object} HtmlNode
 * @prop {(name: string) => string | undefined} attr
 * @prop {() => string} text trimmed text content
 * @prop {(name: string) => boolean} hasClass
 * @prop {(selector: string) => HtmlNode[]} select descendants matching the selector
 */

/**
 * Thin project-owned wrapper so cheerio stays behind one file (plan door 2).
 * @example parseHtmlDocument('<a href="/x">X</a>').select('a')[0].attr('href') // '/x'
 * @param {string} html
 * @returns {{select: (selector: string) => HtmlNode[]}}
 */
export function parseHtmlDocument(html) {
	const $ = load(html);
	return { select: (selector) => toHtmlNodes($, $(selector)) };
}

/**
 * Same interface as `parseHtmlDocument`, parsed as XML (sitemaps).
 * @example parseXmlDocument('<urlset><url><loc>x</loc></url></urlset>').select('url > loc')[0].text() // 'x'
 * @param {string} xml
 * @returns {{select: (selector: string) => HtmlNode[]}}
 */
export function parseXmlDocument(xml) {
	const $ = load(xml, { xml: true });
	return { select: (selector) => toHtmlNodes($, $(selector)) };
}

function toHtmlNodes($, selection) {
	return selection.toArray().map((element) => toHtmlNode($, $(element)));
}

function toHtmlNode($, node) {
	return {
		attr: (name) => node.attr(name),
		text: () => node.text().trim(),
		hasClass: (name) => node.hasClass(name),
		select: (selector) => toHtmlNodes($, node.find(selector)),
	};
}

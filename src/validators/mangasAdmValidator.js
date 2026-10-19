import Joi from 'joi';

async function createManga({ body }, _, next) {
	const schema = Joi.object().keys({
		title: Joi.string().required(),
	});
	await schema.validateAsync(body);
	return next();
}

async function linkConnector(req, _, next) {
	const schema = Joi.object().keys({
		params: Joi.object().keys({
			idManga: Joi.number().integer().required(),
		}),
		body: Joi.object().keys({
			idPlugin: Joi.string().required(),
			idMangaPlugin: Joi.string().required(),
			titlePlugin: Joi.string().required(),
		}),
	});
	await schema.validateAsync(req, { allowUnknown: true });
	return next();
}

async function setAllConnectorsActive(req, _, next) {
	const schema = Joi.object().keys({
		params: Joi.object().keys({
			idManga: Joi.number().integer().required(),
		}),
		body: Joi.object().keys({
			isActive: Joi.boolean().strict().required(),
		}),
	});
	await schema.validateAsync(req, { allowUnknown: true });
	return next();
}

async function setConnectorActive(req, _, next) {
	const schema = Joi.object().keys({
		params: Joi.object().keys({
			idManga: Joi.number().integer().required(),
			idPlugin: Joi.string().required(),
		}),
		body: Joi.object().keys({
			isActive: Joi.boolean().required(),
		}),
	});
	await schema.validateAsync(req, { allowUnknown: true });
	return next();
}

const MAX_ALT_TITLES = 50;
const MAX_ALT_TITLE_LENGTH = 255;

async function replaceAltTitles(req, _, next) {
	const schema = Joi.object().keys({
		params: Joi.object().keys({
			idManga: Joi.number().integer().required(),
		}),
		body: Joi.object()
			.keys({
				altTitles: Joi.array()
					.items(Joi.string().trim().min(1).max(MAX_ALT_TITLE_LENGTH))
					.max(MAX_ALT_TITLES)
					.required(),
			})
			.messages({
				'any.required':
					'"altTitles" is required, expected an array of up to 50 non-empty strings',
				'array.base':
					'"altTitles" must be an array, received {{#value}}; expected up to 50 non-empty strings',
				'array.max':
					'"altTitles" has more than 50 items, expected up to 50 non-empty strings',
				'string.base':
					'{{#label}} must be a string, received {{#value}}; expected a non-empty string up to 255 characters',
				'string.empty':
					'{{#label}} is empty, expected a non-empty string up to 255 characters',
				'string.max':
					'{{#label}} has more than 255 characters, received "{{#value}}"',
			}),
	});
	await schema.validateAsync(req, { allowUnknown: true });
	return next();
}

async function idMangaParam({ params }, _, next) {
	const schema = Joi.object().keys({
		idManga: Joi.number().integer().required(),
	});
	await schema.validateAsync(params);
	return next();
}

async function idMangaCoverParam({ params }, _, next) {
	const schema = Joi.object().keys({
		idManga: Joi.number().integer().positive().required(),
	});
	await schema.validateAsync(params);
	return next();
}

async function chapterParams({ params }, _, next) {
	const schema = Joi.object().keys({
		idManga: Joi.number().integer().required(),
		idChapter: Joi.number().integer().required(),
	});
	await schema.validateAsync(params);
	return next();
}

async function downloadManga(req, _, next) {
	const schema = Joi.object().keys({
		params: Joi.object().keys({
			idManga: Joi.number().integer().required(),
		}),
		query: Joi.object().keys({
			volume: Joi.string().optional(),
		}),
	});
	await schema.validateAsync(req, { allowUnknown: true });
	return next();
}

async function listMangasRegistered({ query }, _, next) {
	const schema = Joi.object().keys({
		title: Joi.string().optional(),
	});
	await schema.validateAsync(query);
	return next();
}

async function registerCookie(req, _, next) {
	const schema = Joi.object().keys({
		body: Joi.object().keys({
			cookie: Joi.string().required(),
			idPlugin: Joi.string().required(),
		}),
	});
	await schema.validateAsync(req, { allowUnknown: true });
	return next();
}

async function registerCredentials(req, _, next) {
	const schema = Joi.object().keys({
		body: Joi.object().keys({
			login: Joi.string().required(),
			password: Joi.string().required(),
			idPlugin: Joi.string().required(),
		}),
	});
	await schema.validateAsync(req, { allowUnknown: true });
	return next();
}

async function cleanupQuery({ query }, _, next) {
	const schema = Joi.object()
		.keys({
			idManga: Joi.number().integer().optional(),
			title: Joi.string().trim().min(1).optional(),
		})
		.oxor('idManga', 'title');
	await schema.validateAsync(query);
	return next();
}

const MangasAdmValidator = {
	createManga,
	replaceAltTitles,
	linkConnector,
	setConnectorActive,
	setAllConnectorsActive,
	idMangaParam,
	idMangaCoverParam,
	chapterParams,
	downloadManga,
	listMangasRegistered,
	registerCookie,
	registerCredentials,
	cleanupQuery,
};
export default MangasAdmValidator;

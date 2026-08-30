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

async function idMangaParam({ params }, _, next) {
	const schema = Joi.object().keys({
		idManga: Joi.number().integer().required(),
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
	const schema = Joi.object().keys({
		idManga: Joi.number().integer().optional(),
	});
	await schema.validateAsync(query);
	return next();
}

const MangasAdmValidator = {
	createManga,
	linkConnector,
	setConnectorActive,
	idMangaParam,
	chapterParams,
	downloadManga,
	listMangasRegistered,
	registerCookie,
	registerCredentials,
	cleanupQuery,
};
export default MangasAdmValidator;

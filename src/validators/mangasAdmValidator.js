import Joi from 'joi';

async function registerManga({ body }, _, next) {
	const schema = Joi.object().keys({
		title: Joi.string().required(),
		titlePlugin: Joi.string().optional(),
		idPlugin: Joi.string().required()
	});
	await schema.validateAsync(body);
	return next();
}
async function listMangasRegistered({ query }, _, next) {
	const schema = Joi.object().keys({
		title: Joi.string().optional()
	});
	await schema.validateAsync(query);
	return next();
}
async function registerCookie(req, _, next) {
	const schema = Joi.object().keys({
		body: Joi.object().keys({
			cookie: Joi.string().required(),
			idPlugin: Joi.string().required()
		})
	});
	await schema.validateAsync(req, { allowUnknown: true });
	return next();
}
async function registerCredentials(req, _, next) {
	const schema = Joi.object().keys({
		body: Joi.object().keys({
			login: Joi.string().required(),
			password: Joi.string().required(),
			idPlugin: Joi.string().required()
		})
	});
	await schema.validateAsync(req, { allowUnknown: true });
	return next();
}
async function listPagesAndSend({ query }, _, next) {
	const schema = Joi.object().keys({
		idChapterPlugin: Joi.string().required(),
		pluginId: Joi.string().required(),
		title: Joi.string().required(),
		idChapter: Joi.string().required(),
		volume: Joi.string().required()
	});
	await schema.validateAsync(query);
	return next();
}
async function updateMangaChapters({ query }, _, next) {
	const schema = Joi.object().keys({
		title: Joi.alternatives(
			Joi.string(),
			Joi.array().items(Joi.string())
		).required()
	});
	await schema.validateAsync(query);
	return next();
}
async function deleteMangaChapters({ query }, _, next) {
	const schema = Joi.object().keys({
		title: Joi.string().required(),
		volume: Joi.string().required()
	});
	await schema.validateAsync(query);
	return next();
}
const MangasAdmValidator = {
	registerManga,
	listMangasRegistered,
	registerCookie,
	registerCredentials,
	listPagesAndSend,
	updateMangaChapters,
	deleteMangaChapters
};
export default MangasAdmValidator;

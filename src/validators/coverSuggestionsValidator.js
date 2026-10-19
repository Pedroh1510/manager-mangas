import Joi from 'joi';

export const SUGGESTION_STATUSES = ['pending', 'accepted', 'dismissed'];

async function listQuery({ query }, _, next) {
	const schema = Joi.object().keys({
		status: Joi.string()
			.valid(...SUGGESTION_STATUSES)
			.optional(),
	});
	await schema.validateAsync(query);
	return next();
}

async function idSuggestionParam({ params }, _, next) {
	const schema = Joi.object().keys({
		idSuggestion: Joi.number().integer().positive().required(),
	});
	await schema.validateAsync(params);
	return next();
}

async function idMangaParam({ params }, _, next) {
	const schema = Joi.object().keys({
		idManga: Joi.number().integer().positive().required(),
	});
	await schema.validateAsync(params);
	return next();
}

async function coverSyncQuery({ query }, _, next) {
	const schema = Joi.object().keys({
		idPlugin: Joi.string().trim().min(1).optional(),
	});
	await schema.validateAsync(query);
	return next();
}

const CoverSuggestionsValidator = {
	listQuery,
	idSuggestionParam,
	idMangaParam,
	coverSyncQuery,
};
export default CoverSuggestionsValidator;

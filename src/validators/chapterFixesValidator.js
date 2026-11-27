import Joi from 'joi';
import { SWITCH_REASON_MAX } from './mangasAdmValidator.js';

const chapterKeys = {
	idManga: Joi.number().integer().required(),
	idChapter: Joi.number().integer().required(),
};

function validateRequest(schemaKeys) {
	const schema = Joi.object().keys(schemaKeys);
	return async (req, _, next) => {
		await schema.validateAsync(req, { allowUnknown: true });
		return next();
	};
}

const chapterParams = validateRequest({
	params: Joi.object().keys(chapterKeys),
});

const blockChapter = validateRequest({
	params: Joi.object().keys(chapterKeys),
	body: Joi.object().keys({
		reason: Joi.string().allow('').max(SWITCH_REASON_MAX).optional(),
	}),
});

const replaceSource = validateRequest({
	params: Joi.object().keys(chapterKeys),
	body: Joi.object().keys({
		idMangaConnector: Joi.number().integer().required(),
		idChapterPlugin: Joi.string().required(),
	}),
});

const mangaParams = validateRequest({
	params: Joi.object().keys({ idManga: chapterKeys.idManga }),
});

const unblockParams = validateRequest({
	params: Joi.object().keys({
		idManga: chapterKeys.idManga,
		idBlockedChapter: Joi.number().integer().required(),
	}),
});

const ChapterFixesValidator = {
	chapterParams,
	blockChapter,
	replaceSource,
	mangaParams,
	unblockParams,
};
export default ChapterFixesValidator;

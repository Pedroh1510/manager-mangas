import { describe, expect, test } from 'vitest';
import { BadRequestError, NotFoundError } from '../../../infra/errors.js';

describe('errors', () => {
	test('NotFoundError serializes with statusCode 404', () => {
		const error = new NotFoundError({ message: 'x' });

		expect(error.statusCode).toEqual(404);
		expect(Object.keys(JSON.parse(JSON.stringify(error))).sort()).toEqual(
			Object.keys(
				JSON.parse(JSON.stringify(new BadRequestError({ message: 'x' }))),
			).sort(),
		);
		expect(JSON.parse(JSON.stringify(error))).toMatchObject({
			message: 'x',
			action: expect.any(String),
			statusCode: 404,
		});
	});
});

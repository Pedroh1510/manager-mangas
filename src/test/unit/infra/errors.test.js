import { describe, expect, test } from 'vitest';
import {
	BadGatewayError,
	BadRequestError,
	NotFoundError,
} from '../../../infra/errors.js';

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

	test('BadGatewayError serializes with statusCode 502', () => {
		const error = new BadGatewayError({ message: 'x', action: 'y' });

		expect(JSON.parse(JSON.stringify(error))).toEqual({
			name: 'BadGatewayError',
			message: 'x',
			action: 'y',
			statusCode: 502,
		});
	});
});

export class ValidationError extends Error {
	constructor({ cause, message, action }) {
		super(message, cause);
		this.name = 'ValidationError';
		this.action = action ?? 'Entre em contato com o suporte';
		this.statusCode = 400;
	}
	toJSON() {
		return {
			name: this.name,
			message: this.message,
			action: this.action,
			statusCode: this.statusCode
		};
	}
}

export class BadRequestError extends Error {
	constructor({ cause, message, action }) {
		super(message, cause);
		this.name = 'BadRequestError';
		this.action = action ?? 'Entre em contato com o suporte';
		this.statusCode = 400;
	}
	toJSON() {
		return {
			name: this.name,
			message: this.message,
			action: this.action,
			statusCode: this.statusCode
		};
	}
}

export class ServiceError extends Error {
	constructor({ cause, message, action }) {
		super(message, cause);
		this.name = 'ServiceError';
		this.action = action ?? 'Entre em contato com o suporte';
	}
}

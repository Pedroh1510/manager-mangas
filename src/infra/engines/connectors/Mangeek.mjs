import { createHash } from 'node:crypto';
import Connector from '../engine/Connector.mjs';

export default class Mangeek extends Connector {
	constructor() {
		super();
		super.id = 'mangeek';
		super.label = 'Mangeek';
		this.tags = ['manga', 'portuguese'];
		this.url = 'http://geekstations.com.br';
	}

	init() {
		this.requestOptions.headers.set('accept', 'application/json');
	}

	_nonce() {
		return Date.now().toString(16).toUpperCase();
	}

	_keyGen(param) {
		return createHash('md5')
			.update(`M<${param}#MANG33K>D`)
			.digest('hex');
	}
}

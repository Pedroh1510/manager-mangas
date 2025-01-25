import axios from 'axios';
import CONFIG_ENV from './env.js';

const api = axios.create({
	baseURL: CONFIG_ENV.URL,
});

export default api;

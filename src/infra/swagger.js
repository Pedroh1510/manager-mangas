import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';
import express from 'express';
import CONFIG_ENV from './env.js';

const routerDoc = express();
export default routerDoc;

const swaggerOptions = {
	swaggerDefinition: {
		openapi: '3.0.0',
		info: {
			title: 'My API',
			version: '1.0.0',
			description: 'API documentation using Swagger'
		},
		servers: [
			{
				url: CONFIG_ENV.URL_DOC
			}
		],
		components: {
			//  securitySchemes: {
			//      bearerAuth: {
			//          type: 'http',
			//          scheme: 'bearer',
			//          bearerFormat: 'JWT',
			//      },
			//  },
		}
	},
	apis: ['./src/controller/*.js'] // Path to your API docs
};

const swaggerDocs = swaggerJSDoc(swaggerOptions);

routerDoc.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

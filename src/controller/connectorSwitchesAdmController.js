import express from 'express';
import ConnectorSwitch from '../service/connectorSwitch.js';
import MangasAdmValidator from '../validators/mangasAdmValidator.js';

// Admin list of "Conector desligado" switches (GLOSSARY), mounted at
// /mangas/adm/connector-switches before the /:idManga routes.
const connectorSwitchesAdmController = express.Router();
export default connectorSwitchesAdmController;

/**
 * @swagger
 * /mangas/adm/connector-switches:
 *   get:
 *     tags: [MangaAdm]
 *     description: Every registry connector with its global on/off state and count of active links
 *     responses:
 *       200:
 *         description: Returns [{ id, url, enabled, disabledAt, disabledReason, activeLinks }] ordered by id
 */
connectorSwitchesAdmController.get('/', async (_req, res) => {
	res.status(200).send(await ConnectorSwitch.listConnectorSwitches());
});

/**
 * @swagger
 * /mangas/adm/connector-switches/{idPlugin}:
 *   put:
 *     tags: [MangaAdm]
 *     description: Turn a connector off (optional reason) or back on for every manga; links keep their own isActive
 *     parameters:
 *       - name: idPlugin
 *         in: path
 *         required: true
 *         type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [enabled]
 *             properties:
 *               enabled:
 *                 type: boolean
 *               reason:
 *                 type: string
 *                 maxLength: 200
 *     responses:
 *       204:
 *         description: Switch updated
 *       400:
 *         description: Invalid body or unknown idPlugin
 */
connectorSwitchesAdmController.put(
	'/:idPlugin',
	MangasAdmValidator.setConnectorSwitch,
	async (req, res) => {
		const { idPlugin } = req.params;
		const { enabled, reason } = req.body;
		if (enabled) await ConnectorSwitch.enableConnector({ idPlugin });
		else await ConnectorSwitch.disableConnector({ idPlugin, reason });
		res.status(204).send();
	},
);

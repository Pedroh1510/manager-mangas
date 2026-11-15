import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import database from '../../../infra/database.js';
import ConnectorSwitchesRepository from '../../../repository/connectorSwitches.js';
import ConnectorSwitch from '../../../service/connectorSwitch.js';
import MangaAdminService from '../../../service/mangaAdmin.js';
import orchestrator from '../../orchestrator.js';

const WICOMIX_REASON = 'site mudou layout/paywall; parser quebrado (PR #47)';

beforeAll(async () => {
	await orchestrator.waitForAllServices();
});

beforeEach(async () => {
	await orchestrator.clearDatabase();
	await orchestrator.runMigrations();
});

async function createMangaWithLink({ title, idPlugin, isActive }) {
	const { idManga } = await MangaAdminService.createManga({ title });
	await MangaAdminService.linkConnector({
		idManga,
		idPlugin,
		idMangaPlugin: title,
		titlePlugin: title,
	});
	await database.query({
		text: 'UPDATE "mangaConnectors" SET "isActive" = $1 WHERE "idManga" = $2',
		values: [isActive, idManga],
	});
	return idManga;
}

async function listLinkStates() {
	const { rows } = await database.query(
		'SELECT "idManga", "isActive" FROM "mangaConnectors" ORDER BY "idManga"',
	);
	return rows;
}

async function readCookie(idPlugin) {
	const { rows } = await database.query({
		text: 'SELECT cookie FROM "pluginConfig" WHERE lower("idPlugin") = $1',
		values: [idPlugin],
	});
	return rows[0]?.cookie;
}

describe('ConnectorSwitch', () => {
	test('disables and re-enables a connector keeping link isActive', async () => {
		await createMangaWithLink({
			title: 'a',
			idPlugin: 'mangeek',
			isActive: false,
		});
		await createMangaWithLink({
			title: 'b',
			idPlugin: 'mangeek',
			isActive: true,
		});
		const before = await listLinkStates();

		await ConnectorSwitch.disableConnector({
			idPlugin: 'mangeek',
			reason: 'x',
		});
		expect(await ConnectorSwitch.isConnectorEnabled('mangeek')).toBe(false);
		await ConnectorSwitch.enableConnector({ idPlugin: 'mangeek' });

		expect(await ConnectorSwitch.isConnectorEnabled('mangeek')).toBe(true);
		expect(await listLinkStates()).toEqual(before);
	});

	test('treats idPlugin case-insensitively', async () => {
		await ConnectorSwitch.disableConnector({ idPlugin: 'MANGEEK' });

		expect(await ConnectorSwitch.isConnectorEnabled('mangeek')).toBe(false);
	});

	test('creates pluginConfig row when missing', async () => {
		await ConnectorSwitch.disableConnector({ idPlugin: 'blitztoons' });

		const found = await ConnectorSwitchesRepository.findSwitch({
			idPlugin: 'blitztoons',
		});
		expect(found.disabledAt).toBeInstanceOf(Date);
	});

	test('keeps cookie across disable and enable', async () => {
		await MangaAdminService.registerCookie({
			idPlugin: 'mangeek',
			cookie: 'c=1',
		});

		await ConnectorSwitch.disableConnector({ idPlugin: 'mangeek' });
		await ConnectorSwitch.enableConnector({ idPlugin: 'mangeek' });

		expect(await readCookie('mangeek')).toBe('c=1');
	});

	test('migration leaves wicomix disabled with reason', async () => {
		const found = await ConnectorSwitchesRepository.findSwitch({
			idPlugin: 'wicomix',
		});

		expect(found.disabledReason).toBe(WICOMIX_REASON);
	});

	test('assertConnectorEnabled throws 409 with reason', async () => {
		await ConnectorSwitch.disableConnector({
			idPlugin: 'mangeek',
			reason: 'x',
		});

		await expect(
			ConnectorSwitch.assertConnectorEnabled('mangeek'),
		).rejects.toMatchObject({
			statusCode: 409,
			message: 'Connector mangeek is disabled: x',
		});
	});

	test('assertConnectorEnabled resolves for an enabled connector', async () => {
		await expect(
			ConnectorSwitch.assertConnectorEnabled('mangeek'),
		).resolves.toBeUndefined();
	});

	test('listEnabledConnectorIds excludes disabled', async () => {
		const ids = await ConnectorSwitch.listEnabledConnectorIds();

		expect(ids).toContain('mangeek');
		expect(ids).not.toContain('wicomix');
	});

	test('blank reason becomes null', async () => {
		await ConnectorSwitch.disableConnector({
			idPlugin: 'mangeek',
			reason: '   ',
		});

		const found = await ConnectorSwitchesRepository.findSwitch({
			idPlugin: 'mangeek',
		});
		expect(found.disabledReason).toBeNull();
	});

	test('rejects a connector outside the registry', async () => {
		await expect(
			ConnectorSwitch.disableConnector({ idPlugin: 'nope' }),
		).rejects.toMatchObject({
			statusCode: 400,
			message: 'Plugin with id nope not found',
		});
	});
});

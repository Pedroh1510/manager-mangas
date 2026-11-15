# Conector desligado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma chave geral por conector, no ADM, que tira o conector de uso para todos os mangás sem mexer no `isActive` de cada link.

**Architecture:** Estado guardado em `pluginConfig` (`disabledAt`, `disabledReason`). Um serviço `connectorSwitch` é a única fonte da verdade; os pontos que acessam o site (`getInstancePlugin`, worker da fila `connector-*`, `linkConnector`, refresh/sync de catálogo e capas) consultam esse serviço. O frontend `manager-apis` ganha uma lista "Conectores" no ADM, selo no detalhe do mangá e status derivado.

**Tech Stack:** Node/Express + sql-bricks + node-pg-migrate + BullMQ + vitest (`manager-mangas`); React + TanStack Query + vitest (`manager-apis`).

**Spec:** decisões 1–9 do grilling de 2026-11-14 (resumo abaixo) + termo **Conector desligado** em `manager-mangas/GLOSSARY.md`.

| # | Decisão |
|---|---|
| 1 | Chave geral por conector; `isActive` dos links intacto; religar restaura. |
| 2 | Detalhe do mangá: link acinzentado, selo "conector desligado", toggle travado mostrando `isActive` guardado. |
| 3 | Wicomix volta ao `registry.js`; migration o deixa desligado com motivo; comentário do registry sai. |
| 4 | Job confere chave ao começar → sucesso vazio; `refreshCatalog` confere entre obras e aborta sem gravar catálogo parcial. |
| 5 | 409 em tudo que toca o site (catálogo, capas, busca/vínculo, download); conector some do wizard de vincular; cookie/credenciais editáveis. |
| 6 | Religar não dispara nada. |
| 7 | `deriveMangaStatus` conta só link ativo **e** conector ligado. |
| 8 | ADM: lista "Conectores" no topo — nome, toggle, nº de links ativos. |
| 9 | Motivo opcional ao desligar + data; aparecem na lista e no selo. |

## Global Constraints

- Funções 4–20 linhas; arquivos < 500 linhas; máx. 2 níveis de indentação; early return.
- Mensagens de erro incluem o valor ofensivo e o formato esperado.
- Docstring (intenção + 1 exemplo) em toda função pública nova.
- Mocks de I/O com classes fake nomeadas em `src/test/fakes/` (manager-mangas), não stubs inline.
- Git: branch `feat/connector-switch` em cada repo, um PR por repo; **sem** linha `Co-Authored-By` (regra do `apis/CLAUDE.md`).
- Ordem de deploy: PR `manager-mangas` mergeado e deployado antes do PR `manager-apis`. Campos novos na API são aditivos (frontend antigo continua funcionando).
- Mensagem de 409: `Connector <idPlugin> is disabled` + `: <motivo>` quando houver motivo; `action`: `Religue o conector em Configurações > Conectores`.
- Motivo: texto livre opcional, máx. 200 caracteres, trim; string vazia vira `null`.
- Motivo da migration para wicomix: `site mudou layout/paywall; parser quebrado (PR #47)`.

## Review Focus

1. **Chapter pendente de download quando o conector é desligado** — job `listPagesAndSend` já enfileirado falha com 409 e o capítulo fica sem `downloadedAt`; ao religar, precisa ser baixável de novo (via "Buscar capítulos"/`download-batch`), nunca marcado como baixado sem páginas. Teste na Task 3.
2. **Job `listPages` na fila no momento do desligamento** — não pode retornar `[]` como sucesso (geraria capítulo "baixado" vazio); falha sem retry. Teste na Task 3.
3. **`idPlugin` com caixa diferente** (`WiComix` vs `wicomix`) — chave vale para ambos, como o resto do `pluginConfig` (`lower("idPlugin")`). Teste na Task 1.
4. **Desligar conector sem linha em `pluginConfig`** (ex.: blitztoons nunca configurado) — cria a linha; religar não apaga cookie/credenciais existentes. Teste na Task 1.
5. **Mangá sem nenhum link de conector ligado aparece `inactive`** e o filtro da `MangasTable` o trata assim. Teste na Task 7.

---

## Repo `manager-mangas`

### Task 1: Migration + repositório + serviço `connectorSwitch`

**Files:**
- Create: `src/infra/migrations/1761000000000_add-connector-switch.cjs`
- Create: `src/repository/connectorSwitches.js`
- Create: `src/service/connectorSwitch.js`
- Modify: `src/connectors/registry.js` (re-adicionar `wicomix: WiComix`, remover comentário de desligado)
- Modify: `src/test/unit/connectors/registry.test.js` (wicomix de volta na lista)
- Test: `src/test/integration/connectorSwitch/connectorSwitch.test.js`

**Interfaces:**
- Produces (repository `ConnectorSwitchesRepository`):
  - `findSwitch({ idPlugin: string }): Promise<{ disabledAt: Date|null, disabledReason: string|null } | null>`
  - `listDisabled(): Promise<Array<{ idPlugin: string, disabledAt: Date, disabledReason: string|null }>>`
  - `setDisabled({ idPlugin: string, reason: string|null }): Promise<void>` — upsert; só toca `disabledAt`/`disabledReason`.
  - `clearDisabled({ idPlugin: string }): Promise<void>`
- Produces (service, default export `ConnectorSwitch`):
  - `isConnectorEnabled(idPlugin: string): Promise<boolean>`
  - `assertConnectorEnabled(idPlugin: string): Promise<void>` — lança `ConflictError` com a mensagem dos Global Constraints.
  - `listEnabledConnectorIds(): Promise<string[]>` — `registry.listConnectorIds()` menos desligados.
  - `disableConnector({ idPlugin: string, reason?: string }): Promise<void>` / `enableConnector({ idPlugin: string }): Promise<void>` — `ValidationError` `Plugin with id <x> not found` se fora do registry.
  - `listConnectorSwitches(): Promise<Array<{ id: string, url: string, enabled: boolean, disabledAt: string|null, disabledReason: string|null, activeLinks: number }>>` — `activeLinks` = links `isActive` de mangás não deletados.

- [ ] **Step 1: Write failing integration tests** em `connectorSwitch.test.js`:
  - `disables and re-enables a connector keeping link isActive` — cria mangá com link mangeek `isActive=false` e outro `true`; `disableConnector({ idPlugin:'mangeek', reason:'x' })` → `isConnectorEnabled('mangeek')` `false`; `enableConnector` → `true`; `isActive` dos dois links inalterado.
  - `treats idPlugin case-insensitively` — `disableConnector({ idPlugin:'MANGEEK' })` → `isConnectorEnabled('mangeek') === false`.
  - `creates pluginConfig row when missing and keeps cookie on enable` — blitztoons sem linha → disable cria; para mangeek com cookie `c=1`, disable+enable → cookie segue `c=1`.
  - `migration leaves wicomix disabled with reason` — após `runMigrations`, `findSwitch({ idPlugin:'wicomix' }).disabledReason === 'site mudou layout/paywall; parser quebrado (PR #47)'`.
  - `assertConnectorEnabled throws 409` — `rejects.toMatchObject({ statusCode: 409, message: 'Connector mangeek is disabled: x' })`.
  - `listEnabledConnectorIds excludes disabled` — não contém `'wicomix'`.
  - `blank reason becomes null` — `reason:'   '` → `disabledReason === null`.
- [ ] **Step 2: Run** `npx vitest run src/test/integration/connectorSwitch` → FAIL (módulo não existe).
- [ ] **Step 3: Implement migration** — `addColumns('pluginConfig', { disabledAt: { type:'timestamptz', notNull:false }, disabledReason: { type:'text', notNull:false } })`; depois SQL que atualiza a linha `lower("idPlugin")='wicomix'` ou insere se não existir (`disabledAt = now()`, motivo dos Global Constraints). `down`: drop columns.
- [ ] **Step 4: Implement repository e serviço** com as assinaturas acima. Upsert = `UPDATE ... WHERE lower("idPlugin")=lower($1)`, se `rowCount === 0` → `INSERT` (mesmo padrão de `registerCookie` em `mangaAdmin.js:170`). Re-adicionar wicomix no `registry.js` e no teste do registry.
- [ ] **Step 5: Run** `npx vitest run src/test/integration/connectorSwitch src/test/unit/connectors/registry.test.js` → PASS.
- [ ] **Step 6: Commit** `feat(connectors): store a global on/off switch per connector`

### Task 2: Bloquear acesso ao site (409) e esconder do wizard

**Files:**
- Modify: `src/service/manga.js` — `getInstancePlugin` chama `ConnectorSwitch.assertConnectorEnabled(pluginId)` antes de ler `pluginConfig`; `listPlugins` adiciona `enabled: boolean` a cada item.
- Modify: `src/service/mangaAdmin.js` — `linkConnector` chama `assertConnectorEnabled` após a checagem de registry.
- Modify: `src/controller/mangasAdmController.js` — `POST /catalog/:idPlugin/refresh` chama `assertConnectorEnabled`.
- Modify: `src/controller/mangasController.js` — `GET /:pluginId/cover/:idMangaPlugin` chama `assertConnectorEnabled`.
- Modify: `src/service/coverSuggestions/index.js` e `matching.js` — trocar `listConnectorIds()` por `ConnectorSwitch.listEnabledConnectorIds()` (sync de todos e matching); sync de um plugin específico chama `assertConnectorEnabled`.
- Modify: `src/service/chapterDiscovery.js` — `listActiveLinks` também filtra links cujo conector está desligado (evita log `connector_failed` por link).
- Test: `src/test/integration/mangas/pluginId/disabled.test.js`, `src/test/integration/mangas/adm/connectors/disabled.test.js`, unit em `src/test/unit/service/chapterDiscovery*.test.js` (arquivo existente).

**Interfaces:**
- Consumes: `ConnectorSwitch.assertConnectorEnabled`, `listEnabledConnectorIds`, `isConnectorEnabled` (Task 1).
- Produces: `GET /mangas/plugins` → `Array<{ id: string, url: string, enabled: boolean }>`.

- [ ] **Step 1: Write failing tests:**
  - `GET /mangas/:pluginId?title=x returns 409 when connector disabled` → `status 409`, `data.message === 'Connector mangeek is disabled: teste'`.
  - `POST /mangas/adm/catalog/mangeek/refresh returns 409 when disabled`.
  - `POST /mangas/adm/:idManga/connectors (link) returns 409 when disabled`.
  - `PATCH cookie still works when disabled` → 2xx.
  - `GET /mangas/plugins flags disabled connector` → item wicomix com `enabled:false`, mangeek `enabled:true`.
  - unit: `discovery skips links of a disabled connector` — fake switch com wicomix desligado; mangá com links mangeek+wicomix ativos → `listChapters` só chamado para mangeek.
- [ ] **Step 2: Run** os arquivos acima → FAIL.
- [ ] **Step 3: Implement** os pontos listados em Files.
- [ ] **Step 4: Run** `npx vitest run src/test/unit` + arquivos de integração acima → PASS.
- [ ] **Step 5: Commit** `feat(connectors): refuse site access for a disabled connector`

### Task 3: Worker da fila do conector + abort do `refreshCatalog`

**Files:**
- Modify: `src/service/queue/connectorQueue.js`
- Modify: `src/connectors/Connector.js` (contrato `_getMangas(options)` documentado)
- Modify: `src/connectors/wicomix/WiComix.js` (`_getMangas`)
- Test: `src/test/unit/service/queue/connectorQueue.test.js` (existente ou novo), `src/test/unit/connectors/wicomix/*.test.js`

**Interfaces:**
- Consumes: `ConnectorSwitch.isConnectorEnabled` (Task 1), injetado no worker como parâmetro (`startConnectorWorkers({ isConnectorEnabled })`, default o serviço real).
- Produces:
  - `class CatalogRefreshStoppedError extends UnrecoverableError` (BullMQ) em `connectorQueue.js`, exportada.
  - `_getMangas({ shouldStop }: { shouldStop?: () => Promise<boolean> } = {})` — WiComix chama `shouldStop` a cada `CATALOG_STOP_CHECK_EVERY = 25` obras e lança `CatalogRefreshStoppedError` se `true`, **antes** de `indexStore.save` final (checkpoints parciais do índice já gravados podem ficar; o catálogo não é gravado). Outros conectores ignoram a opção.

Comportamento ao começar o job com conector desligado:
- `refreshCatalog` → retorna `0`, não chama `saveCatalog` nem post-refresh jobs.
- `listChapters` → retorna `[]`.
- `listPages` → lança `UnrecoverableError('Connector <id> is disabled')` (não `[]`: página vazia viraria capítulo baixado vazio — Review Focus 2).
- `refreshCatalog` interrompido no meio (`CatalogRefreshStoppedError`) → worker captura e retorna `0`.

- [ ] **Step 1: Write failing unit tests** (fake `isConnectorEnabled`, `TestFixtureConnector`):
  - `refreshCatalog job is an empty success when connector disabled` → retorna `0`, `FakeCatalogs.saved` vazio.
  - `listChapters job returns [] when disabled`.
  - `listPages job fails unrecoverably when disabled` → rejeita com `UnrecoverableError`.
  - `refreshCatalog stops mid-run without saving catalog` — `shouldStop` vira `true` após 1ª checagem → resultado `0`, catálogo não salvo.
  - WiComix: `_getMangas calls shouldStop every 25 works and throws CatalogRefreshStoppedError` — sitemap fake com 60 slugs, `shouldStop` retorna `true` na 2ª chamada → lança após processar 50, `shouldStop` chamado 2×.
  - `pending chapter stays undownloaded when listPagesAndSend hits disabled connector` — `downloadedAt` segue `null` (Review Focus 1).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — no wrapper do worker: `if (!(await isConnectorEnabled(connectorId))) return disabledResult(job.name, connectorId)`; `refreshCatalog(connector, { shouldStop: async () => !(await isConnectorEnabled(connector.id)) })`.
- [ ] **Step 4: Run** `npx vitest run src/test/unit` → PASS.
- [ ] **Step 5: Commit** `feat(queue): drop and stop connector jobs once the connector is disabled`

### Task 4: API do ADM + conectores no JSON do mangá

**Files:**
- Create: `src/controller/connectorSwitchesAdmController.js` (montado em `mangasAdmController` como `/connector-switches`, antes de rotas `/:idManga`)
- Modify: `src/validators/mangasAdmValidator.js` (validador do PUT)
- Modify: `src/repository/mangas.js` — `CONNECTORS_JSON` e qualquer outra query que monta `connectors` do mangá ganham `connectorEnabled` (`"pluginConfig"."disabledAt" IS NULL`), `connectorDisabledAt`, `connectorDisabledReason` via `LEFT JOIN "pluginConfig" ON lower(...)=lower(...)`.
- Test: `src/test/integration/mangas/adm/connector-switches/get.test.js`, `put.test.js`; ajustar `src/test/integration/mangas/adm/get.test.js`.

**Interfaces:**
- Consumes: `ConnectorSwitch.listConnectorSwitches`, `disableConnector`, `enableConnector` (Task 1).
- Produces:
  - `GET /mangas/adm/connector-switches` → `200 Array<{ id, url, enabled, disabledAt, disabledReason, activeLinks }>` ordenado por `id`.
  - `PUT /mangas/adm/connector-switches/:idPlugin` body `{ enabled: boolean, reason?: string (≤200) }` → `204`. `enabled:true` ignora `reason`. 400 se `enabled` não for boolean ou `reason` > 200; 400 `Plugin with id <x> not found`.
  - Conector no JSON do mangá: `{ idMangaConnector, idPlugin, titlePlugin, isActive, connectorEnabled: boolean, connectorDisabledAt: string|null, connectorDisabledReason: string|null }`.
  - Swagger JSDoc nas duas rotas, no padrão do controller existente.

- [ ] **Step 1: Write failing tests:**
  - `GET connector-switches lists every registry connector` → contém `{ id:'wicomix', enabled:false, disabledReason:'site mudou layout/paywall; parser quebrado (PR #47)' }` e `activeLinks` correto para mangeek com 2 links ativos + 1 inativo → `2`.
  - `PUT disables with reason then enables` → GET reflete; `disabledAt` ISO string.
  - `PUT rejects non-boolean enabled` → 400; `PUT rejects reason over 200 chars` → 400; `PUT unknown plugin` → 400 com `Plugin with id nope not found`.
  - `GET /mangas/adm lists connectorEnabled per link` → link wicomix `connectorEnabled:false`, mangeek `true`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/test/integration/mangas/adm` → PASS; `npx biome check src` limpo.
- [ ] **Step 5: Commit** `feat(adm): expose connector switches and per-link connector state`
- [ ] **Step 6: PR + deploy** — PR em `Pedroh1510/manager-mangas` com test plan (pós-deploy: `/mangas/adm/connector-switches` mostra wicomix desligado; `/queues-summary` sem atividade `connector-wicomix`). Após merge, deploy via Coolify e confirmar.

---

## Repo `manager-apis`

### Task 5: Cliente API + hook

**Files:**
- Modify: `src/features/mangas/services/api.ts` (+ tipos no arquivo de tipos importado no topo)
- Create: `src/features/mangas/hooks/useConnectorSwitches.ts`
- Test: `src/features/mangas/services/api.test.ts`, `src/features/mangas/hooks/useConnectorSwitches.test.tsx`

**Interfaces:**
- Produces:
  - `interface ConnectorSwitch { id: string; url: string; enabled: boolean; disabledAt: string | null; disabledReason: string | null; activeLinks: number }`
  - `Plugin` ganha `enabled: boolean`; tipo do conector do mangá ganha `connectorEnabled: boolean; connectorDisabledAt: string | null; connectorDisabledReason: string | null`.
  - `fetchConnectorSwitches(): Promise<ConnectorSwitch[]>`; `setConnectorSwitch(idPlugin: string, payload: { enabled: boolean; reason?: string }): Promise<void>` (PUT).
  - `useConnectorSwitches(): { switches: UseQueryResult<ConnectorSwitch[]>; setSwitch: UseMutationResult<void, Error, { idPlugin: string; enabled: boolean; reason?: string }> }` — `queryKey ['mangas','connector-switches']`; sucesso invalida `['mangas']` inteiro (plugins, lista e detalhe).

- [ ] **Step 1:** testes: `fetchConnectorSwitches GETs /mangas/adm/connector-switches`; `setConnectorSwitch PUTs enabled and reason`; `setSwitch invalidates mangas queries`.
- [ ] **Step 2:** `npx vitest run src/features/mangas/services src/features/mangas/hooks/useConnectorSwitches.test.tsx` → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** mesmo comando → PASS; `npm run typecheck` limpo.
- [ ] **Step 5:** commit `feat(mangas): client for connector switches`

### Task 6: Lista "Conectores" no ADM

**Files:**
- Create: `src/features/mangas/components/ConnectorSwitchesCard.tsx`
- Modify: `src/features/mangas/pages/AdminPage.tsx` — card no topo, antes do card de plugin; no `<select>`, opção de conector desligado com sufixo ` (desligado)`; "Atualizar catálogo" e "Sincronizar capas" desabilitados quando o plugin selecionado está desligado.
- Test: `src/features/mangas/components/ConnectorSwitchesCard.test.tsx`, ajustar `AdminPage.test.tsx`

**Interfaces:**
- Consumes: `useConnectorSwitches` (Task 5).
- Comportamento: uma linha por conector — nome (`font-mono`), toggle (componente de toggle já usado em `MangaDetailPage`), `N links ativos`, e quando desligado: `desligado em <dd/mm/aaaa> — <motivo>`. Desligar abre **inline** na linha um `Input` "Motivo (opcional)" `maxLength=200` + botões "Desligar" / "Cancelar" (sem `confirm()`/modal do browser). Ligar é imediato.

- [ ] **Step 1:** testes: `lists each connector with active link count`; `disabling asks for optional reason inline and sends it`; `enabling sends enabled true without reason`; `shows disabled date and reason`; `AdminPage marks disabled plugin in select and disables catalog refresh`.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar, seguindo tokens/estilo de `AdminPage` (`Card`, `text-xs text-text-muted`).
- [ ] **Step 4:** `npx vitest run src/features/mangas` → PASS; `npm run lint && npm run typecheck`.
- [ ] **Step 5:** commit `feat(mangas): connector on/off list in admin settings`

### Task 7: Detalhe do mangá, status derivado e wizard

**Files:**
- Modify: `src/features/mangas/lib/mangaStatus.ts`
- Modify: `src/features/mangas/pages/MangaDetailPage.tsx`
- Modify: `src/features/mangas/lib/pluginChoice.ts` (ou onde o wizard monta a lista de plugins — filtrar `enabled`)
- Test: `mangaStatus.test.ts`, `MangaDetailPage.test.tsx`, `pluginChoice.test.ts`, `MangasTable.test.tsx`

**Interfaces:**
- `deriveMangaStatus(connectors: ReadonlyArray<{ isActive: boolean; connectorEnabled?: boolean }>): MangaStatus` — "buscando" = `isActive && connectorEnabled !== false`; 0 → `inactive`, todos → `active`, senão `partial`.
- Linha do link com conector desligado: `opacity-60`, selo "conector desligado" com `title` = `desligado em <data> — <motivo>`, toggle `disabled` mostrando `isActive` guardado.

- [ ] **Step 1:** testes: `status inactive when only active link is on disabled connector`; `status partial with mangeek active and wicomix active-but-disabled`; `detail shows disabled badge and locks toggle`; `wizard hides disabled connectors`; `MangasTable inactive filter includes manga whose only link is on disabled connector` (Review Focus 5).
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npm run test -- --run && npm run lint && npm run typecheck` → PASS.
- [ ] **Step 5:** commit `feat(mangas): show disabled connectors on manga detail and status`
- [ ] **Step 6:** PR em `Pedroh1510/manager-apis`; após merge, deploy e conferir *Necromante Sem Limites*: wicomix acinzentado com selo e motivo.

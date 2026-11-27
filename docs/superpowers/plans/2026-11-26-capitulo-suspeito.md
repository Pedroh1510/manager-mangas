# Capítulo suspeito Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir que capítulo rotulado errado por uma fonte (ex.: Mangeek "177" = 171) ocupe o volume, e dar ao ADM as ações "baixar de outra fonte" e "apagar e bloquear".

**Architecture:** Regra de salto como módulo puro (`chapterGap.js`) com orquestração em duas passadas injetável (`planDiscovery`), plugada em `chapterDiscovery.js`. Bloqueio numa tabela nova lida pela descoberta. Ações de correção num serviço/controller próprios (`chapterFixes`), fora do `mangaAdmin.js`/`mangasAdmController.js` que já estão grandes. Frontend: botões na `ChaptersTable`, drawer de fontes e card de bloqueados.

**Tech Stack:** Node 24 ESM, Express, Joi, sql-bricks-postgres, node-pg-migrate, BullMQ, Vitest (manager-mangas); React 19, TanStack Query, axios, Vitest + Testing Library (manager-apis).

**Spec:** `docs/superpowers/specs/2026-11-26-capitulo-suspeito-design.md` (manager-mangas)

## Global Constraints

- Repo `apis/CLAUDE.md`: funções 4–20 linhas, arquivos < 500 linhas, máx. 2 níveis de indentação, mensagens de erro com valor recebido e formato esperado, fakes nomeados (classes em `src/test/fakes/`), sem `Co-Authored-By` nos commits, branch + PR (nunca commit em `main`).
- Branches: manager-mangas `feat/capitulo-suspeito`; manager-apis `feat/capitulo-suspeito-adm`.
- Chave de volume: `String(Number(volume))` (`"171.0000"` → `"171"`, `"171.5000"` → `"171.5"`).
- Warn de capítulo segurado: `status: 'chapter_held_gap'` com campos `idManga, idPlugin, idMangaConnector, idChapterPlugin, volume, previousKnownVolume`.
- Bloqueio chaveado por `(idMangaConnector, idChapterPlugin)`; `reason` opcional, máx. 200 chars (mesmo limite de `SWITCH_REASON_MAX`).
- Sem botão de apagar simples no ADM: o "Remover" atual vira "Apagar e bloquear". A rota `DELETE /:idManga/chapters/:idChapter` continua.
- Testes: `npm run test` em cada repo. Lint: `npm run biome:check` (manager-mangas).

## Review Focus

1. Link escolhido na troca cujo `idChapterPlugin` já está registrado em outra linha de `chapters` (UNIQUE `(idMangaConnector, idChapterPlugin)`) → 409, arquivo e linha antigos intactos. Teste na Task 5.
2. Capítulo bloqueado listado por um link não pode fechar buraco de outro volume → continua segurado. Teste na Task 2.
3. Link que falha (rejeitado) na varredura não contribui volumes para a união e não aborta a segunda passada dos outros. Teste na Task 2.
4. Volume de destino da troca diferente do volume da linha (fonte lista outro número para o id) → 400. Teste na Task 5.
5. Kavita fora do ar durante apagar+bloquear/troca → ação conclui, só warn `chapter_fix_kavita_scan_failed`. Teste na Task 4.

---

## Parte A — manager-mangas

### Task 1: Chave de volume e regra de salto (puro)

**Files:**
- Modify: `src/utils/chapterFormat.js` (adicionar `toVolumeKey`)
- Create: `src/service/chapterGap.js`
- Test: `src/test/unit/utils/chapterFormat.test.js`, `src/test/unit/service/chapterGap.test.js`

**Interfaces:**
- Produces:
  - `toVolumeKey(volume: string | number): string`
  - `findGap({ volume: string|number, knownVolumeKeys: Set<string> }): { isHeld: boolean, previousKnownVolume: number | null }`

- [ ] **Step 1: Testes que falham**

```js
// chapterFormat.test.js
test('toVolumeKey normalizes NUMERIC strings', () => {
	expect(toVolumeKey('171.0000')).toBe('171');
	expect(toVolumeKey('171.5000')).toBe('171.5');
	expect(toVolumeKey(171)).toBe('171');
});

// chapterGap.test.js
const keys = (...v) => new Set(v.map(String));
test('holds 177 when highest known integer below is 171', () => {
	expect(findGap({ volume: '177', knownVolumeKeys: keys(170, 171) }))
		.toEqual({ isHeld: true, previousKnownVolume: 171 });
});
test('does not hold the next contiguous volume', () => {
	expect(findGap({ volume: 172, knownVolumeKeys: keys(171) }).isHeld).toBe(false);
});
test('does not hold when nothing is known below', () => {
	expect(findGap({ volume: 5, knownVolumeKeys: keys() }))
		.toEqual({ isHeld: false, previousKnownVolume: null });
	expect(findGap({ volume: 1, knownVolumeKeys: keys(10) }).isHeld).toBe(false);
});
test('decimal volumes are never held and never fill a gap', () => {
	expect(findGap({ volume: '171.5', knownVolumeKeys: keys(100) }).isHeld).toBe(false);
	expect(findGap({ volume: 173, knownVolumeKeys: keys(171, '172.5') }))
		.toEqual({ isHeld: true, previousKnownVolume: 171 });
});
```

- [ ] **Step 2:** `npm run test -- chapterFormat chapterGap` → FAIL (export inexistente).
- [ ] **Step 3:** Implementar. `findGap`: volume não inteiro → não segura; `previousKnownVolume` = maior chave inteira `< volume`; segura se `previousKnownVolume !== null && previousKnownVolume < volume - 1`. Docstring com exemplo.
- [ ] **Step 4:** Testes → PASS.
- [ ] **Step 5:** Commit `feat: add volume key and gap rule for chapter discovery`.

### Task 2: Descoberta em duas passadas (orquestração injetável)

**Files:**
- Modify: `src/service/chapterGap.js` (adicionar `planDiscovery`)
- Create: `src/test/fakes/FakeDiscoveryLinks.js`
- Test: `src/test/unit/service/chapterGap.test.js`

**Interfaces:**
- Consumes: `toVolumeKey`, `findGap` (Task 1).
- Produces:

```js
/**
 * @param {{
 *   links: Array<{ idMangaConnector: number, idPlugin: string }>,
 *   storedVolumeKeys: Set<string>,                 // volumes no banco, já normalizados
 *   blockedKeys: Set<string>,                      // `${idMangaConnector}:${idChapterPlugin}`
 *   listLinkChapters: (link) => Promise<Array<{ id: string, title: string, volume: string }>>,
 *   recordChapter: ({ link, chapter }) => Promise<object|null>,
 *   reportHeld: ({ link, chapter, previousKnownVolume }) => void,
 * }} params
 * @returns {Promise<{ recorded: object[], outcomes: PromiseSettledResult[] }>}
 */
export async function planDiscovery(params)
```

Algoritmo (não determinado só pela assinatura):
1. Cada link em paralelo (`Promise.allSettled`): lista; descarta bloqueados; descarta volumes já em `storedVolumeKeys`; para o resto, `findGap` contra `storedVolumeKeys` — não segurado → `recordChapter` na hora; segurado → guarda em `deferred`. Retorna `{ recorded, deferred, listedKeys }` (listedKeys = chaves dos capítulos não bloqueados).
2. Depois de todos: `known = storedVolumeKeys ∪ listedKeys de links fulfilled`. Para cada `deferred`: `findGap` contra `known` → não segurado → `recordChapter`; segurado → `reportHeld`.
3. Banco vazio (`storedVolumeKeys.size === 0`) → nada é segurado (cai naturalmente de `findGap`, sem caso especial).

- [ ] **Step 1: Testes que falham** — `FakeDiscoveryLinks` guarda capítulos por link, registra chamadas de `recordChapter`/`reportHeld`, permite link lento (promise controlada) e link que rejeita.

```js
test('holds 177 when no link lists 172-176', async () => {
	// stored {170,171}; mangeek lists 170,171,177
	expect(fake.recordedVolumes()).toEqual([]);
	expect(fake.held()).toEqual([{ volume: '177', previousKnownVolume: 171 }]);
});
test('records 177 when another link lists 172-176 in the same scan', ...);   // recorded 172..177
test('records 177 when another link also lists 177', ...);                    // 177 recorded once (recordChapter devolve null p/ duplicado)
test('blocked chapter is skipped and does not fill a gap', ...);             // link B lista 172-176 bloqueados → 177 de A segurado; 172-176 não gravados
test('rejected link contributes no volumes and others still finish', ...);   // outcomes tem 1 rejected; held calculado sem ele
test('contiguous volume is recorded before a slow link answers', ...);       // A grava 172 com B ainda pendente
test('empty database holds nothing', ...);                                   // stored {} ; lista 50,51,90 → todos gravados
```

- [ ] **Step 2:** Testes → FAIL.
- [ ] **Step 3:** Implementar `planDiscovery` (+ helpers pequenos: `blockKey(link, chapter)`, `scanLink`, `settleDeferred`).
- [ ] **Step 4:** Testes → PASS.
- [ ] **Step 5:** Commit `feat: plan chapter discovery in two passes to hold gap volumes`.

### Task 3: Tabela de bloqueio e ligação na descoberta

**Files:**
- Create: `src/infra/migrations/1764100000000_add-blocked-chapters.cjs`
- Create: `src/repository/blockedChapters.js`
- Modify: `src/service/chapterDiscovery.js` (usar `toVolumeKey`, `planDiscovery`, bloqueados; `listChaptersMissing` normaliza e ignora bloqueados)
- Modify: `GLOSSARY.md` (termos **Capítulo segurado** e **Capítulo bloqueado**, texto da spec)
- Test: `src/test/integration/mangas/adm/chapters-missing/get.test.js`, `src/test/integration/mangas/chapterDiscovery/gap.test.js`
- Modify: `src/connectors/testFixture/TestFixtureConnector.js` (manga id `'3'` lista volumes 170, 171, 177: ids `ch-170`, `ch-171`, `ch-177`)

**Interfaces:**
- Consumes: `planDiscovery`, `toVolumeKey`.
- Produces (`BlockedChaptersRepository`):
  - `insertBlocked({ idMangaConnector: number, idChapterPlugin: string, volume: string|number, reason: string|null }): Promise<{ idBlockedChapter: number }>`
  - `listBlockedByManga({ idManga: number }): Promise<Array<{ idBlockedChapter, idMangaConnector, idPlugin, idChapterPlugin, volume, reason, createdAt }>>` (join `mangaConnectors`, ordenado por `volume`)
  - `deleteBlocked({ idManga: number, idBlockedChapter: number }): Promise<number>` (rowCount; filtra pelo mangá via join/subquery)
  - `listBlockedKeysByManga({ idManga }): Promise<Set<string>>` (`${idMangaConnector}:${idChapterPlugin}`)

Migration: schema da spec, seção 3, com `ON DELETE CASCADE` no FK; `down` = `dropTable`.

- [ ] **Step 1: Testes de integração que falham**

```js
// chapters-missing/get.test.js — regressão do bug "171.0000" vs "171"
test('does not list volumes already stored', async () => {
	// cria mangá, liga test-fixture idMangaPlugin '1', insere capítulo volume 375 via ChaptersRepository.insertChapter
	// GET /mangas/adm/:id/chapters/missing → volumes [376]
});
test('does not list blocked chapters', ...); // insertBlocked ch-376 → missing []

// chapterDiscovery/gap.test.js
test('holds fixture volume 177 when 172-176 are missing everywhere', async () => {
	// mangá + link test-fixture idMangaPlugin '3'; insere 170 e 171 no banco
	// await updateMangaChapters({ idManga })
	// listChaptersByManga → volumes ['170.0000','171.0000'] (177 ausente)
});
```

- [ ] **Step 2:** `npm run test -- chapters-missing chapterDiscovery` → FAIL.
- [ ] **Step 3:** Migration + repositório (padrão de `connectorSwitches.js`: sql-bricks, docstring com exemplo).
- [ ] **Step 4:** Ligar em `chapterDiscovery.js`: `listKnownVolumes` devolve chaves normalizadas; `discoverChaptersAcrossLinks` chama `planDiscovery` com `recordChapter` = `recordDiscoveredChapter` existente e `reportHeld` = `logger.warn({ status: 'chapter_held_gap', ... })`. `throwIfAnyLinkFailed` continua sobre `outcomes`. Remover `discoverLinkChapters` (substituído). Atualizar GLOSSARY.
- [ ] **Step 5:** `npm run test` (suite toda) → PASS; `npm run biome:check` limpo.
- [ ] **Step 6:** Commit `feat: block chapters per link and hold gap volumes in discovery`.

### Task 4: Serviço de correção — apagar+bloquear, listar e desbloquear

**Files:**
- Create: `src/service/kavita/connection.js` (mover `ensureKavitaConnection` de `cleanupReadChapters.js`, com parâmetro `statusPrefix`; cleanup passa `'kavita_cleanup'` e mantém os mesmos status de log)
- Create: `src/service/kavita/scanMangaSeries.js`
- Create: `src/service/chapterFixes.js`
- Create: `src/test/fakes/FakeChapterFixesDeps.js`
- Test: `src/test/unit/service/chapterFixes.test.js`, `src/test/unit/service/kavita/scanMangaSeries.test.js`

**Interfaces:**
- Consumes: `BlockedChaptersRepository` (Task 3), `MangaAdminService.deleteChapter`, `KavitaClient`, `findMatchingSeries`.
- Produces:
  - `scanMangaSeries({ title: string }): Promise<boolean>` — best-effort: conexão falha, série não achada ou scan lança → `false` + `logger.warn({ status: 'chapter_fix_kavita_scan_failed', title, reason })`; nunca lança.
  - `createChapterFixes(deps) → ChapterFixes` com `deps = { chapters: ChaptersRepository, blocked: BlockedChaptersRepository, deleteChapter, scanSeries, ...(Task 5) }`; default exportado `ChapterFixes = createChapterFixes(defaultDeps)`.
  - `ChapterFixes.blockChapter({ idManga, idChapter, reason }): Promise<{ idBlockedChapter: number }>` — capítulo inexistente ou de outro mangá → `NotFoundError` (mensagem com idChapter/idManga); insere bloqueio, depois `deleteChapter`, depois `scanSeries({ title })`.
  - `ChapterFixes.listBlocked({ idManga }): Promise<Blocked[]>`
  - `ChapterFixes.unblock({ idManga, idBlockedChapter }): Promise<void>` — rowCount 0 → `NotFoundError`.

- [ ] **Step 1: Testes que falham**

```js
test('blockChapter inserts block, deletes chapter, scans Kavita', async () => {
	// fake chapter { idChapter: 1248700, idManga: 15, idMangaConnector: 15, idChapterPlugin: '1700083334', volume: '177.0000', title: 'Sobrevivendo...' }
	await fixes.blockChapter({ idManga: 15, idChapter: 1248700, reason: 'cópia do 171' });
	expect(deps.blocked.inserted).toEqual([{ idMangaConnector: 15, idChapterPlugin: '1700083334', volume: '177.0000', reason: 'cópia do 171' }]);
	expect(deps.deleted).toEqual([{ idManga: 15, idChapter: 1248700 }]);
	expect(deps.scanned).toEqual([{ title: 'Sobrevivendo...' }]);
});
test('blockChapter of another manga throws NotFoundError and changes nothing', ...);
test('blockChapter still resolves when Kavita scan returns false', ...);
test('unblock unknown id throws NotFoundError', ...);
// scanMangaSeries.test.js (FakeKavitaClient): health false → false + warn; series not found → false; scan throws → false; ok → true
```

- [ ] **Step 2:** Testes → FAIL.
- [ ] **Step 3:** Implementar os três arquivos; `cleanupReadChapters.test.js` existente deve continuar passando sem mudança.
- [ ] **Step 4:** `npm run test` → PASS.
- [ ] **Step 5:** Commit `feat: add block and unblock chapter fixes with Kavita rescan`.

### Task 5: Troca de fonte — candidatos e substituição atômica

**Files:**
- Modify: `src/service/download.js` (`downloadChapter` aceita `targetPath?: string`; default = caminho atual)
- Create: `src/repository/pluginConfig.js` (`findPluginAccess({ idPlugin }): Promise<{ cookie: string|null, userAgent: string|null }>`, case-insensitive como `connectorSwitches.js`)
- Modify: `src/repository/chapters.js` (`updateChapterSource({ idChapter, idMangaConnector, idChapterPlugin, name }): Promise<void>` — também `downloadedAt = now()`; erro de UNIQUE propaga, não é engolido)
- Modify: `src/service/chapterFixes.js`
- Test: `src/test/unit/service/chapterFixes.test.js`, `src/test/unit/service/download.test.js`

**Interfaces:**
- Consumes: `MangaService.listChaptersByManga`, `MangaService.listPages`, `ConnectorSwitch.isConnectorEnabled/assertConnectorEnabled`, `MangaConnectorsRepository.listConnectorsByManga`, `toVolumeKey`, `blockKey` lógica (Task 2/3).
- Produces:
  - `ChapterFixes.listSources({ idManga, idChapter }): Promise<ChapterSource[]>`

```ts
type ChapterSource = {
	idMangaConnector: number; idPlugin: string; titlePlugin: string;
	isCurrent: boolean;                                   // link atual da linha
	status: 'available' | 'missing' | 'blocked' | 'disabled' | 'failed';
	idChapterPlugin?: string; title?: string;             // quando available/blocked
	reason?: string;                                      // disabled: disabledReason; failed: error.message
};
```
  Só links `isActive`. Consulta em paralelo (`Promise.allSettled`). Casa por `toVolumeKey(chapter.volume) === toVolumeKey(row.volume)`.
  - `ChapterFixes.replaceSource({ idManga, idChapter, idMangaConnector, idChapterPlugin }): Promise<{ idChapter: number }>`:
    1. linha inexistente/de outro mangá → `NotFoundError`; link não é do mangá ou inativo → `BadRequestError`; conector desligado → `ConflictError` (via `assertConnectorEnabled`); par bloqueado → `ConflictError`.
    2. `listChaptersByManga` do link; `idChapterPlugin` ausente ou com volume diferente → `BadRequestError` (mensagem com volume esperado e recebido).
    3. `listPages` → `findPluginAccess` → `downloadChapter({ ..., targetPath: <chapterPath>.replacing })`. Falha → `rm` do temporário, relança; arquivo e linha antigos intactos.
    4. `updateChapterSource` (UNIQUE violado → `ConflictError`, `rm` do temporário, nada trocado) → `rename(temp, chapterPath)` → `scanSeries`.

- [ ] **Step 1: Testes que falham**

```js
test('download.downloadChapter writes to targetPath when given', ...);
test('listSources marks current link, available, missing, blocked, disabled, failed', ...);
test('replaceSource swaps file and row after a good download', async () => {
	expect(deps.fs.renamed).toEqual([{ from: '/d/T/177.0000.cbz.replacing', to: '/d/T/177.0000.cbz' }]);
	expect(deps.chapters.updated).toEqual([{ idChapter: 1248700, idMangaConnector: 31, idChapterPlugin: '435999', name: 'Capítulo 177' }]);
});
test('replaceSource keeps old file and row when download fails', ...);        // renamed [], updated [], temp removido
test('replaceSource returns 409 when chapter id already stored in another row', ...); // Review Focus 1
test('replaceSource rejects a target listed with a different volume', ...);  // Review Focus 4
test('replaceSource rejects disabled connector and blocked pair with ConflictError', ...);
```

- [ ] **Step 2:** Testes → FAIL.
- [ ] **Step 3:** Implementar (deps de fs: `{ rename, rm }` injetados em `createChapterFixes`).
- [ ] **Step 4:** `npm run test` → PASS.
- [ ] **Step 5:** Commit `feat: replace chapter source with atomic file swap`.

### Task 6: Rotas HTTP

**Files:**
- Create: `src/controller/chapterFixesAdmController.js` (montado em `mangasAdmController.js` com `mangasAdmController.use(chapterFixesAdmController)`, como `coverSuggestionsAdmController`; rotas com caminho completo `/:idManga/...`, swagger JSDoc no padrão existente)
- Create: `src/validators/chapterFixesValidator.js`
- Test: `src/test/integration/mangas/adm/chapter-fixes/chapterFixes.test.js`

**Interfaces:**
- Consumes: `ChapterFixes` (Tasks 4–5).
- Produces (contrato do frontend):

| Método | Rota | Body | Resposta |
|---|---|---|---|
| GET | `/mangas/adm/:idManga/chapters/:idChapter/sources` | — | 200 `ChapterSource[]` |
| POST | `/mangas/adm/:idManga/chapters/:idChapter/replace` | `{ idMangaConnector: int, idChapterPlugin: string }` | 200 `{ idChapter }` |
| POST | `/mangas/adm/:idManga/chapters/:idChapter/block` | `{ reason?: string ≤200, '' permitido }` | 201 `{ idBlockedChapter }` |
| GET | `/mangas/adm/:idManga/blocked-chapters` | — | 200 `Blocked[]` |
| DELETE | `/mangas/adm/:idManga/blocked-chapters/:idBlockedChapter` | — | 200 |

  `reason: ''` grava `null`.

- [ ] **Step 1: Testes de integração que falham** (`AdmUtils`, conector `test-fixture`, chapter inserido via repositório)

```js
test('POST block then GET blocked-chapters lists it and chapter row is gone', ...);
test('DELETE blocked-chapters removes it; unknown id returns 404', ...);
test('POST block with reason over 200 chars returns 400', ...);
test('GET sources lists test-fixture as current link', ...);
test('POST replace with link of another manga returns 400', ...);
test('POST replace keeps chapter when fixture download fails', ...); // páginas http://test-fixture.invalid → erro; GET chapters mostra linha original
test('POST replace on disabled connector returns 409', ...);        // ConnectorSwitch.disableConnector({ idPlugin: 'test-fixture' }) e religar no afterAll
```

- [ ] **Step 2:** Testes → FAIL.
- [ ] **Step 3:** Implementar validator (Joi, padrão de `mangasAdmValidator.js`) e controller.
- [ ] **Step 4:** `npm run test` → PASS; `npm run biome:check` limpo.
- [ ] **Step 5:** Commit `feat: expose chapter fix routes in admin API`.
- [ ] **Step 6:** Push `feat/capitulo-suspeito` e abrir PR manager-mangas. Corpo inclui: "após deploy, rodar `POST /migrations` (Coolify não roda migration)".

---

## Parte B — manager-apis (depois do PR A em produção)

### Task 7: API client, tipos e hook

**Files:**
- Modify: `src/features/mangas/services/types.ts` (`ChapterSource`, `BlockedChapter` — formato da Task 6)
- Modify: `src/features/mangas/services/api.ts` (`fetchChapterSources`, `replaceChapterSource`, `blockChapter`, `fetchBlockedChapters`, `unblockChapter`)
- Create: `src/features/mangas/hooks/useChapterFixes.ts`
- Modify: `src/features/mangas/hooks/useMangaChapters.ts` (remover `removeChapter` — sem apagar simples)
- Test: `src/features/mangas/services/api.test.ts`, `src/features/mangas/hooks/useChapterFixes.test.tsx`

**Interfaces:**
- Produces: `useChapterFixes(idManga: number)` → `{ blocked: UseQueryResult<BlockedChapter[]>, sources: UseMutation<ChapterSource[], idChapter>, replace: UseMutation<void, {idChapter, idMangaConnector, idChapterPlugin}>, block: UseMutation<void, {idChapter, reason}>, unblock: UseMutation<void, idBlockedChapter> }`. Query key `['mangas', idManga, 'blocked-chapters']`. `replace`/`block`/`unblock` invalidam `['mangas', idManga, 'chapters']` e a de bloqueados; toasts: "Capítulo trocado", "Capítulo apagado e bloqueado", "Capítulo desbloqueado"; erro via `getApiErrorMessage`.

- [ ] **Step 1:** Testes que falham (padrão de `api.test.ts` e `useConnectorSwitches.test.tsx`): cada função chama a URL/verbo/body da tabela da Task 6; mutations invalidam as duas keys.
- [ ] **Step 2:** `npm run test:run -- api useChapterFixes` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat: add chapter fix api client and hook`.

### Task 8: Telas — trocar fonte, apagar e bloquear, bloqueados

**Files:**
- Modify: `src/features/mangas/components/ChaptersTable.tsx` (botão "Remover" → "Apagar e bloquear"; novo botão "Trocar fonte"; props `onReplace`, `onBlock` no lugar de `onDelete`)
- Create: `src/features/mangas/components/ChapterSourcesDrawer.tsx` (usa `Drawer`; loading enquanto `sources` roda; uma linha por fonte; `available` habilita "Usar esta"; demais acinzentadas com texto: missing "não tem este capítulo", blocked "bloqueado", disabled "conector desligado: {reason}", failed "fonte falhou: {reason}"; selo "atual" em `isCurrent`)
- Create: `src/features/mangas/components/BlockedChaptersCard.tsx` (fonte, volume formatado, motivo ou "—", data via `formatDateTime`, botão "Desbloquear"; vazio → "Nenhum capítulo bloqueado")
- Modify: `src/features/mangas/pages/MangaDetailPage.tsx` (ConfirmDialog de bloquear com `Input` de motivo opcional, texto: "O capítulo será apagado e esta fonte não o trará de novo."; drawer; card abaixo da tabela)
- Test: `ChapterSourcesDrawer.test.tsx`, `BlockedChaptersCard.test.tsx`, `MangaDetailPage.test.tsx`

- [ ] **Step 1: Testes que falham**

```tsx
test('drawer enables only available sources and shows reasons for the rest', ...);
test('choosing a source calls replace with its idMangaConnector and idChapterPlugin', ...);
test('block dialog sends typed reason and empty reason as ""', ...);
test('chapters table has no plain remove button', () => {
	expect(screen.queryByRole('button', { name: /^Remover/ })).toBeNull();
});
test('blocked card lists entries and unblock calls mutation', ...);
```

- [ ] **Step 2:** `npm run test:run` → FAIL.
- [ ] **Step 3:** Implementar seguindo os componentes existentes (`ConnectorSwitchesCard`, `ConfirmDialog`, `Drawer`).
- [ ] **Step 4:** `npm run test:run` → PASS; `npm run lint` (se existir no package.json) limpo.
- [ ] **Step 5:** Commit `feat: add replace source and block chapter actions to manga detail`.
- [ ] **Step 6:** Push `feat/capitulo-suspeito-adm`, abrir PR manager-apis.

---

## Pós-deploy (manual, com o usuário)

1. PR A em produção → `POST /migrations` → conferir tabela `blockedChapters`.
2. PR B em produção.
3. idManga 15: "Apagar e bloquear" no volume 177 (idChapter 1248700), motivo "Mangeek: cópia do 171".
4. Próxima varredura: 177 não volta; OpenObserve sem erro novo; `chapter_held_gap` só se a fonte publicar novo salto.

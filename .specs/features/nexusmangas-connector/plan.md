# Nexus Mangas connector

## Problem

Obras publicadas em PT-BR no Nexus Mangas (744 obras no catálogo em 2026-10-17: 423 manhwa, 204
mangá, 99 manhua, 10 webtoon, 8 novel) não podem ser cadastradas, baixadas, atualizadas nem
sugeridas pelo manager-mangas: hoje só existem `mangeek` e `nexustoons`. Quem quer essas obras
na biblioteca do Kavita baixa à mão ou fica sem elas. A fonte não traz números de demanda além do
tamanho do catálogo.

Quando isso entrar, `nexusmangas` aparece na lista de plugins, o catálogo dele alimenta a
sugestão de conector por capa, e capítulos gratuitos baixam e atualizam como nos outros
conectores.

## Flow

Reusa a classe base `Connector` (`wait`, `_toCatalogEntry`), a fila por
conector, o `imageDownloader` e o registro único que já alimenta plugins, filas, hash de capas e
sugestões. Nada do `nexustoons` é reaproveitado: a plataforma é outra (Supabase, sem cifra).

1. job da fila -> `connectorQueue` (exists) chama `initialize()` e depois `_getMangas`/`_getChapters`/`_getPages`
2. `NexusMangas.initialize()` (door 2) - lê `https://www.nexusmangas.com/`, acha `/assets/entries/pages.*.js`, extrai a chave `anon`; se falhar usa a chave fixa e loga aviso
3. `NexusMangas` -> `https://supabase.nexusmangas.com` (`/rest/v1/works`, `/rest/v1/chapters`, `/functions/v1/read-chapter`) com `apikey` + `Authorization: Bearer <anon>`, numa fila de 2000 ms compartilhada pela instância
4. `_getPages` devolve URLs absolutas de `assets.nexusmangas.com` -> `imageDownloader` (exists) baixa sem passar pela fila da API
5. out: o id da obra e dos capítulos (door 1) ficam persistidos pelo `mangaAdmin` (exists) como em qualquer conector

## Impact

| Front | What changes |
| --- | --- |
| domain | novo id de conector `nexusmangas` (label `Nexus Mangas`) - entra automaticamente em `listConnectorIds()`, consumido por `manga.js` (lista de plugins), `allQueues`, `connectorQueue`, `coverHashQueue` e `coverSuggestions` |
| tests | `registry.test.js` "lists the production connectors" passa a esperar três ids |
| queue | nova entrada `CONCURRENCY_BY_CONNECTOR.nexusmangas = 1` |
| stored data | nothing to migrate - só linhas novas com `idPlugin = nexusmangas` |

## Relations

None - no stored-data shape change. O conector só define o valor dos ids (door 1).

## Surface

None - nothing consumed outside. As rotas existentes recebem `pluginId=nexusmangas` sem mudar
de assinatura.

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 1. id da obra e do capítulo persistidos | `id` da obra = `works.id` (UUID); `id` do capítulo = `chapters.id` (UUID) | slug da obra (`works.slug`): `/rest/v1/chapters` filtra por `work_id`, então o slug custaria uma consulta a mais por obra, e slug pode ser renomeado pelo site |
| 2. padrão de chave pública extraída do bundle | `findBundlePath(html)` -> `/\/assets\/entries\/pages\.[\w-]+\.js/`; `findAnonKey(js)` -> JWT `eyJ0eXAi…` atribuído logo após a URL `https://supabase.nexusmangas.com`; fallback = literal do bundle de 2026-10-17 | env var: obriga reconfigurar o deploy quando o site gira a chave; só chave fixa: quebra sem aviso na rotação |

- Nothing else in this change is hard to reverse

## Criteria

### S1: catálogo (P1)

O catálogo completo e baixável chega ao contrato de conector.

**Acceptance Criteria**

1. WHEN `_getMangas()` runs THEN the connector SHALL request `GET /rest/v1/works` with `limit=1000` and increasing `offset` until a page returns fewer than 1000 rows, and SHALL return every row
2. The connector SHALL request the catalog with `is_licensed=eq.false` and `type=neq.NOVEL`, so licensed works and novels never reach the catalog
3. WHEN a work is mapped THEN the connector SHALL return `{ id: works.id, title: works.title, coverUrl: works.cover_url }`, leaving `coverUrl` out when `cover_url` is empty

**Independent test:** unit test with recorded catalog pages; `listConnectorIds()` includes `nexusmangas`.

### S2: capítulos (P1)

Uma obra cadastrada lista seus capítulos.

**Acceptance Criteria**

4. WHEN `_getChapters(manga)` runs THEN the connector SHALL request `GET /rest/v1/chapters?select=id,work_id,number,chapter_label,title,published_at&work_id=eq.{manga.id}&order=number.asc`
5. WHEN a chapter is mapped THEN the connector SHALL return `{ id: chapters.id, title: "Cap. {number}", language: "pt" }`, ignoring `title` and `chapter_label`

**Independent test:** unit test with a recorded chapter list.

### S3: páginas (P1)

Um capítulo gratuito vira a lista ordenada de URLs de imagem; o protegido falha explicitamente.

**Acceptance Criteria**

6. WHEN `_getPages(chapter)` runs THEN the connector SHALL `POST /functions/v1/read-chapter` with body `{"chapterId": chapter.id}` and header `x-nexus-client: reader-v4`, and SHALL return `chapter.pages` in response order
7. IF the response has `access.allowed !== true` THEN the connector SHALL throw an error naming the chapter id and `access.reason` (e.g. `LICENSED`, `PAYWALL`, `EARLY_ACCESS`)
8. IF the response has `chapter.is_novel === true` or an empty `chapter.pages` THEN the connector SHALL throw an error naming the chapter id

**Independent test:** unit tests with a recorded `ALLOWED` and a recorded `LICENSED` response.

### S4: chave anon (P1)

Toda chamada carrega a chave pública atual do site.

**Acceptance Criteria**

9. WHEN `initialize()` runs THEN the connector SHALL fetch `https://www.nexusmangas.com/`, find the `/assets/entries/pages.*.js` bundle, extract the anon JWT, and send it as `apikey` and `Authorization: Bearer <key>` on every Supabase request
10. IF the bundle cannot be fetched or holds no anon key THEN the connector SHALL use the fallback key, log a warning with `event: "anon_key_fallback"`, and retry extraction on the next `initialize()`
11. WHEN `initialize()` is called concurrently THEN the connector SHALL fetch the site HTML only once

**Independent test:** unit tests with a recorded HTML shell and bundle excerpt.

### S5: ritmo e limites (P1)

O conector não martela a API e sobrevive a 429.

**Acceptance Criteria**

12. WHILE jobs share one instance the connector SHALL keep at least 2000 ms between the starts of consecutive Supabase requests
13. IF a Supabase request answers 429 THEN the connector SHALL wait `retryAfterSeconds` from the body (or the `Retry-After` header, else 2000 ms) and retry, at most 2 times, then throw with the status
14. The connector queue SHALL run `nexusmangas` jobs with concurrency 1

**Independent test:** unit tests with fake timers and a mocked `fetch`.

### S6: em produção (P2)

Um capítulo real baixa de ponta a ponta.

**Acceptance Criteria**

15. WHEN the deployed API registers a Nexus Mangas work and downloads one free chapter THEN the system SHALL write that chapter's webp pages to the download directory and the job SHALL finish without error

**Independent test:** after deploy, register one work through the admin API, download one chapter, check files and job status.

## Out of scope

| Excluded | Why |
| --- | --- |
| Capítulos PAYWALL / EARLY_ACCESS / VIP via login ou cookie | Q2: sem contornar conteúdo protegido |
| Busca por título no site | contrato de conector não tem busca; catálogo completo cobre |
| Novels | contrato baixa imagens |
| Usar `allChapters` do `read-chapter` para filtrar acesso por capítulo | Q6: melhoria futura se o campo trouxer acesso |
| Teste automatizado contra o site real | Q9: só se o site começar a quebrar |

## Assumptions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| tags do conector | `['manhwa', 'portuguese']` | mesmo formato do nexustoons; maioria do catálogo é manhwa | n |
| header `x-nexus-client` | constante `reader-v4` no código | é o valor atual do bundle; mudança aparece como erro no log | n |
| resposta PAYWALL/EARLY_ACCESS | mesma forma do `LICENSED` (`access.allowed=false`, `reason`) | não achamos capítulo assim; fixture sintética derivada do `LICENSED` | n |
| User-Agent | Firefox, como o nexustoons | o site respondeu com UA comum; não testamos sem | n |
| download das imagens | `imageDownloader` atual, com o referer de origem que ele já manda | imagem baixou sem Referer, então o referer extra é inofensivo | n |

**Open questions:**

| # | Kind | Question | Until answered |
| --- | --- | --- | --- |
| 1 | blocks go-live | ok para merge, deploy no Coolify e teste em produção (AC 15) | AC 15 não roda |

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| API externa Supabase (cliente) | erro e códigos | AC 7, AC 8, AC 13; 5xx no mesmo laço de retry do `_fetchApi` |
| API externa Supabase (cliente) | rate limit | AC 12, AC 13 |
| API externa Supabase (cliente) | versionamento | AC 10 (chave), assumption `reader-v4` |
| lista de plugins / sugestões | coleção nova | existing - `listConnectorIds()` alimenta tudo |
| rotas internas | resposta, auth | n/a - nenhuma rota nova ou alterada |

## Sources

- sessão de grilling 2026-10-17 (Q1-Q9) - escopo, política de conteúdo protegido, ritmo, título, entrega
- respostas reais da API capturadas em 2026-10-17 - forma de `works`, `chapters`, `read-chapter`

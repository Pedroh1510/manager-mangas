# Nexus Mangas connector verification

**Verdict**: FAIL
**Profile**: light
**Diff range**: d473bce..9e600de
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

The only unproven check is C16, the live production run (AC 15). It has not run yet because it is
waiting on the go-ahead for merge and deploy (plan open question 1, which blocks go-live). C1-C15
and C17 are proven at HEAD with located assertions. The verdict turns PASS once C16 runs green
after deploy and this report is re-verified in a scoped round.

## Binding sources

None - the plan marks no design or contract source as binding (Profile `light`, so step 1 does not run).

## Checks

Proof run (one invocation, all checks): `npx vitest run src/test/unit/connectors/nexusmangas src/test/unit/connectors/registry.test.js src/test/unit/service/queue/connectorQueue.test.js --reporter=verbose` - exit 0, 4 files, 37 passed, 0 failed. Every test named below appears in that output individually as passed. `T` = `src/test/unit/connectors/nexusmangas/NexusMangas.test.js`.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | works paginates offset 0 then 1000, limit 1000, stops on short page, returns both pages | `catalog paginates by offset until a short page` ran, passed | `T:131` - `expect(params.map((p) => p.get('offset'))).toEqual(['0', '1000'])`; `T:132` limit `'1000'`; `T:133` - `toHaveLength(1000 + shortPage.length)` | PASS |
| C2 | catalog carries `is_licensed=eq.false`, `type=neq.NOVEL` | `catalog query excludes licensed works and novels` ran, passed | `T:146` - `expect(params.get('is_licensed')).toBe('eq.false')`; `T:147` - `toBe('neq.NOVEL')` | PASS |
| C3 | work -> `{id, title, coverUrl}`; empty cover has no `coverUrl` key | `catalog entry uses the work uuid and cover_url` ran, passed | `T:163` - `expect(withCover).toEqual({ id: recorded.id, title: recorded.title, coverUrl: recorded.cover_url })`; `T:168` - `expect(withoutCover).toEqual({ id: 'work-2', title: 'Obra 2' })` | PASS |
| C4 | chapters request select/work_id/order | `chapters are requested by work id in number order` ran, passed | `T:183` - `params.get('select')` toBe `'id,work_id,number,chapter_label,title,published_at'`; `T:186` - `` toBe(`eq.${chapters[0].work_id}`) ``; `T:187` - `toBe('number.asc')` | PASS |
| C5 | `number: 10.5` + title -> `{ id, title: "Cap. 10.5", language: "pt" }` | `chapter title is Cap. number regardless of title` ran, passed | `T:207` - `expect(chapter).toEqual({ id: recorded.id, title: 'Cap. 10.5', language: 'pt' })` | PASS |
| C6 | POST read-chapter, body `{chapterId}`, header `x-nexus-client: reader-v4`, pages in order | `pages come from read-chapter in response order` ran, passed | `T:227` - `request.headers.get('x-nexus-client')` toBe `'reader-v4'`; `T:229` - body toEqual `{ chapterId: allowed.chapter.id }`; `T:232` - `expect(pages).toEqual(allowed.chapter.pages)` | PASS |
| C7 | LICENSED and PAYWALL reject naming chapter id and reason | `blocked chapter rejects with its access reason` ran, passed | `T:246` - `rejects.toThrow(new RegExp(`${chapter.id}.*LICENSED`))`; `T:249` - same with `PAYWALL` | PASS |
| C8 | `is_novel: true` and `pages: []` reject naming chapter id | `novel or empty chapter rejects` ran, passed | `T:264` and `T:265` - `rejects.toThrow(chapter.id)` (novel, then empty) | PASS |
| C9 | after initialize, requests carry extracted key as `apikey` and `Bearer` | `requests carry the anon key extracted from the bundle` and `anonKey.test.js > finds the pages bundle and the anon key` ran, passed | `T:282` - `request.headers.get('apikey')` toBe `BUNDLE_KEY`; `T:283` - `authorization` toBe `` `Bearer ${BUNDLE_KEY}` ``; `src/test/unit/connectors/nexusmangas/anonKey.test.js:15-16` - `findBundlePath(html)` toBe `'/assets/entries/pages.D2BFSKBZ.js'`, `findAnonKey(bundle)` toBe the JWT | PASS |
| C10 | bundle 404 -> fallback key, `anon_key_fallback` warning, next initialize refetches HTML | `falls back to the known key and retries extraction next time` ran, passed | `T:297` - `expect(fallbackKey).not.toBe(BUNDLE_KEY)`; `T:301` - warnings `.event` toContain `'anon_key_fallback'`; `T:304` - `site.requestsTo('/')` toHaveLength `2` | PASS |
| C11 | concurrent initialize fetches HTML once | `concurrent initialize loads the key once` ran, passed | `T:312` - `expect(site.requestsTo('/')).toHaveLength(1)` | PASS |
| C12 | two concurrent `_getChapters` requests >= 2000 ms apart (fake timers) | `requests are spaced 2000 ms apart across concurrent calls` ran, passed | `T:337` - `expect(second - first).toBeGreaterThanOrEqual(2000)` | PASS |
| C13 | 429 `retryAfterSeconds: 3` retried after 3000 ms, second answer returned | `429 waits retryAfterSeconds and retries` ran, passed | `T:351` - one request at 2999 ms; `T:356` - `expect(await result).toHaveLength(chapters.length)`; `T:357` - 2 requests | PASS |
| C14 | three 429s reject with `429` after exactly 3 requests | `429 gives up after 2 retries` ran, passed | `T:368` - `expect(result).rejects.toThrow('429')`; `T:372` - `toHaveLength(3)` | PASS |
| C15 | `connector-nexusmangas` worker with concurrency 1; `listConnectorIds()` = three ids | `connectorQueue.test.js > nexusmangas worker runs with concurrency 1` and `registry.test.js > lists the production connectors` ran, passed | `src/test/unit/service/queue/connectorQueue.test.js:135-139` - `WorkerMock` toHaveBeenCalledWith `'connector-nexusmangas'`, `expect.objectContaining({ concurrency: 1 })`; `src/test/unit/connectors/registry.test.js:15` - `toEqual(['mangeek', 'nexustoons', 'nexusmangas'])` | PASS |
| C16 | deployed API registers a work, downloads a free chapter, webp pages on disk, job finished OK | not run - live production check pending merge/deploy go-ahead (plan open question 1) | no evidence - not yet proven, pending go-live | NOT RUN |
| C17 | 503 then 200 returns the second answer | `5xx is retried once and the next answer returned` ran, passed | `T:385` - `expect(await result).toHaveLength(chapters.length)`; `T:386` - 2 requests | PASS |

### Level and sampling (light)

- Request-shape claims (C1, C2, C4, C6, C9) assert on the `Request` the stubbed global `fetch` received, which is the real outbound boundary for an HTTP client. The level fits.
- C9 says "every Supabase request" but samples only `/rest/v1/chapters`. That is enough because all three endpoints build their requests in one function, `_buildApiRequest` (`src/connectors/nexusmangas/NexusMangas.js:135-146`).
- C15's concurrency half cannot tell the explicit map entry apart from `DEFAULT_CONCURRENCY = 1`. `checks.md` already says so; accepted under light.

### Findings (non-blocking notes)

1. **Precision gap, C17 claim text.** The claim says the retry is the "existing `fetchJSON` retry reached through the connector", and plan Observable says "5xx via `fetchJSON` existente". The code never calls `fetchJSON`. `_fetchApi` has its own loop that retries 5xx up to 2 times with a 5000 ms delay (`NexusMangas.js:111-126`, `SERVER_ERROR_DELAY_MS`). The test name also says "retried once". The behaviour C17 asserts is still true. Only the claim's statement of where the retry comes from is wrong, and the 5xx-exhausted path (three 5xx answers then a throw) has no proof.
2. **Precision gap, C12 default.** The test passes `apiDelayMs: 2000` explicitly (`T:323`). The production default is `API_DELAY_MS = 2000` (`NexusMangas.js:15,27`), but no proof checks it. A regression in the default would pass C12.

### Swept `existing` re-read

- idempotency (existing - BullMQ jobs and `mangaAdmin` own dedup): confirmed. `src/service/mangaAdmin.js:29-30` rejects a manga that already exists and `:69` rejects a manga already linked to the connector. `src/service/queue/downloadQueue.js:17` adds jobs with `jobId`, and `src/service/queue/connectorQueue.js:74` uses `deduplication: { id: catalog-<id> }`.

## Gate

`npx vitest run src/test/unit/connectors/nexusmangas src/test/unit/connectors/registry.test.js src/test/unit/service/queue/connectorQueue.test.js --reporter=verbose` - 37 passed, 0 failed (C16 not run: live, pending go-live)

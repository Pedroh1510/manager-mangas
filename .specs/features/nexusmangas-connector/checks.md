# Nexus Mangas connector checks

Profile: light
Plan: `.specs/features/nexusmangas-connector/plan.md`

## Intent

17 checks in 6 slices · 2 one-way doors · 1 open, of which 0 block (1 blocks go-live)

## Checks

Unit proofs run with `npx vitest run <file> -t "<name>"`; `fetch` is mocked with recorded responses
under `src/test/fixtures/nexusmangas/`. Test file `T` = `src/test/unit/connectors/nexusmangas/NexusMangas.test.js`.

### S1 - catálogo · 3 files · 12 KB · ~3k

**C1** - `_getMangas()` requests `/rest/v1/works` with `limit=1000`, `offset=0` then `offset=1000`, stops after a page shorter than 1000 rows, and returns the rows of both pages (AC 1)
Proof: `npx vitest run T -t "catalog paginates by offset until a short page"`

**C2** - Every catalog request carries `is_licensed=eq.false` and `type=neq.NOVEL` (AC 2)
Proof: `npx vitest run T -t "catalog query excludes licensed works and novels"`

**C3** - A work maps to `{ id: works.id, title, coverUrl: cover_url }`, and a work with empty `cover_url` has no `coverUrl` key (AC 3)
Proof: `npx vitest run T -t "catalog entry uses the work uuid and cover_url"`

### S2 - capítulos · 2 files · 6 KB · ~2k

**C4** - `_getChapters({ id })` requests `/rest/v1/chapters` with `select=id,work_id,number,chapter_label,title,published_at`, `work_id=eq.{id}` and `order=number.asc` (AC 4)
Proof: `npx vitest run T -t "chapters are requested by work id in number order"`

**C5** - A chapter with `number: 10.5` and a non-empty `title` maps to `{ id: chapters.id, title: "Cap. 10.5", language: "pt" }` (AC 5)
Proof: `npx vitest run T -t "chapter title is Cap. number regardless of title"`

### S3 - páginas · 3 files · 14 KB · ~4k

**C6** - `_getPages({ id })` sends `POST /functions/v1/read-chapter` with JSON body `{"chapterId": id}` and header `x-nexus-client: reader-v4`, and returns `chapter.pages` in response order for the recorded `ALLOWED` response (AC 6)
Proof: `npx vitest run T -t "pages come from read-chapter in response order"`

**C7** - A response with `access: { allowed: false, reason: "LICENSED" }` rejects with an error containing the chapter id and `LICENSED`; the same for a `PAYWALL` response (AC 7)
Proof: `npx vitest run T -t "blocked chapter rejects with its access reason"`

**C8** - A response with `chapter.is_novel: true` rejects with an error containing the chapter id; so does one with `chapter.pages: []` (AC 8)
Proof: `npx vitest run T -t "novel or empty chapter rejects"`

### S4 - chave anon · 3 files · 10 KB · ~3k

**C9** - After `initialize()` against the recorded HTML shell and bundle excerpt, every Supabase request carries `apikey: <extracted key>` and `authorization: Bearer <extracted key>` (AC 9)
Proof: `npx vitest run T -t "requests carry the anon key extracted from the bundle"`
Proof: `npx vitest run src/test/unit/connectors/nexusmangas/anonKey.test.js -t "finds the pages bundle and the anon key"`

**C10** - When the bundle answers 404, requests carry the fallback key, a warning with `event: "anon_key_fallback"` is logged, and the next `initialize()` fetches the HTML again (AC 10)
Proof: `npx vitest run T -t "falls back to the known key and retries extraction next time"`

**C11** - Two concurrent `initialize()` calls fetch the site HTML exactly once (AC 11)
Proof: `npx vitest run T -t "concurrent initialize loads the key once"`

### S5 - ritmo e limites · 3 files · 14 KB · ~4k

**C12** - Two `_getChapters` calls started together on one instance issue their requests at least 2000 ms apart (fake timers) (AC 12)
Proof: `npx vitest run T -t "requests are spaced 2000 ms apart across concurrent calls"`

**C13** - A 429 with body `{"retryAfterSeconds": 3}` is retried after 3000 ms and the second answer is returned (AC 13)
Proof: `npx vitest run T -t "429 waits retryAfterSeconds and retries"`

**C14** - Three consecutive 429 answers reject with an error containing `429` after exactly 3 requests (AC 13)
Proof: `npx vitest run T -t "429 gives up after 2 retries"`

**C17** - A `503` followed by `200` on a Supabase request returns the second answer (existing `fetchJSON` retry reached through the connector) (Flow hop 3, AC 13 sibling)
Proof: `npx vitest run T -t "5xx is retried once and the next answer returned"`

**C15** - With `nexusmangas` registered, `startConnectorWorkers()` creates `connector-nexusmangas` with `concurrency: 1`, and `listConnectorIds()` returns `['mangeek', 'nexustoons', 'nexusmangas']` (AC 14)
Proof: `npx vitest run src/test/unit/service/queue/connectorQueue.test.js -t "nexusmangas worker runs with concurrency 1"`
Proof: `npx vitest run src/test/unit/connectors/registry.test.js -t "lists the production connectors"`

### S6 - em produção · 0 files · ~1k

**C16** - On the deployed API, registering one Nexus Mangas work and downloading one free chapter leaves that chapter's `.webp` pages in the download directory and the job finished without error (AC 15)
Proof: live run after deploy - `curl` the admin register + download routes, then list the chapter directory in the container and query the job's log/trace in OpenObserve

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| catalog pagination (2 cases) | full page then continue C1 · short page stops C1 | - |
| catalog filters (2) | `is_licensed` C2 · `NOVEL` C2 | - |
| cover mapping (2) | present C3 · empty C3 | - |
| `read-chapter` access outcome (3) | `ALLOWED` C6 · `LICENSED` C7 · `PAYWALL` C7 | - |
| non-image chapter (2) | `is_novel` C8 · empty `pages` C8 | - |
| anon key source (3) | bundle C9 · fallback C10 · concurrent load C11 | - |
| HTTP outcome per request (4) | 200 C6 · 429 then 200 C13 · 429 exhausted C14 · 503 then 200 C17 | - |
| door 1: persisted ids (2) | work uuid C3 · chapter uuid C5 | - |
| door 2: key extraction pattern (1) | C9 | - |
| registry consumers (1 entry point) | `listConnectorIds()` C15 | - |

- Claims naming a request shape or header: C1, C2, C4, C6, C9 - each asserts on the `Request` the mocked `fetch` received
- C15's concurrency half also holds under `DEFAULT_CONCURRENCY = 1`; the explicit map entry documents intent, the proof cannot distinguish it (light profile)

## Swept

- validation: C3, C8 - empty cover and non-image chapters handled; ids passed through `encodeURIComponent`/query params
- failure modes: C7, C8, C10, C14
- idempotency: existing - BullMQ jobs and `mangaAdmin` own dedup; the connector only reads
- authorization: n/a - public anon key, reads only; no protected route added
- concurrency: C11, C12, C15
- data lifecycle: n/a - no stored data owned by the connector
- dependency failure: C10, C13, C14
- state transitions: n/a - the connector is stateless apart from the cached key (C10)
- observability: C10 (`anon_key_fallback` warning); request spans come from the existing OTel `fetch` instrumentation

## Handoff

- S1-S5 touch ~6 source files + 3 test files + ~6 fixtures ≈ 60 KB / 4 ≈ 15k, plus reading `Connector.js`, `registry.js`, `connectorQueue.js` and the `nexustoons` analogue (≈ 34 KB ≈ 9k) → ~24k, under the 150k budget - one builder
- S6 runs after the go-ahead for merge + deploy (plan open question 1)

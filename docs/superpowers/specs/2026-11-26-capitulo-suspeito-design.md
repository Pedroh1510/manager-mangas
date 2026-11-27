# Capítulo suspeito: salto, bloqueio e troca de fonte

Data: 2026-11-26 · Origem: grilling sobre "Sobrevivendo no Jogo Como um Bárbaro" (idManga 15)

## Problema

O Mangeek (site espelho, `mirror: true`) republicou o capítulo 171 da MediocreToons com o título
"Capítulo 177" (idChapterPlugin `1700083334`, outro CDN, slug em inglês). O parser leu certo o
título publicado. Os volumes 172–176 não existem em fonte nenhuma. Comparação visual entre o 171
e o 177: SSIM ≈ 0,99.

Efeitos:

- O volume 177 fica ocupado por cópia do 171. `UNIQUE(idManga, volume)` + **Primeira fonte a
  responder** impede que o 177 verdadeiro seja baixado.
- Só apagar não resolve: a próxima **Descoberta de capítulos** reinsere o falso, porque o Mangeek
  continua listando.
- Não há tela para trocar capítulo de fonte nem para impedir que um capítulo específico volte.

Bug encontrado no caminho: `listKnownVolumes` monta o Set com `${chapter.volume}` vindo do
Postgres (`"171.0000"`), e compara com o volume do conector (`"171"`). Nunca casa. Toda varredura
tenta reinserir tudo e depende do UNIQUE + duplicata engolida em `ChaptersRepository.insertChapter`.
`/chapters/missing` devolve volumes que já existem.

## Decisões

### 1. Normalizar volume na comparação

`listKnownVolumes` e as comparações da descoberta usam uma chave normalizada
(`String(Number(volume))`: `"171.0000"` → `"171"`, `"171.5000"` → `"171.5"`). Vale também para
`listChaptersMissing`. Pré-requisito da regra de salto.

### 2. Regra de salto (Capítulo segurado)

Um volume novo N, inteiro, vindo de um link, é **segurado** quando o maior volume inteiro
conhecido abaixo de N é menor que N−1.

- **Conhecido** = volumes no banco ∪ volumes que qualquer link ativo (com conector ligado) listou
  nesta varredura.
- Mangá sem nenhum volume no banco: não há referência, nada é segurado.
- Volumes decimais (171.5) nunca são segurados e não preenchem buraco.
- Sai da espera só automaticamente, em varredura futura: quando o buraco fecha (alguma fonte lista
  os volumes intermediários) ou quando outro link também lista N (aí ele não é mais buraco do
  ponto de vista do conjunto conhecido — o volume entra pela regra normal de primeira fonte a
  responder). Sem botão "liberar", sem prazo.
- Nada é persistido: a varredura só pula e registra `logger.warn({ status: 'chapter_held_gap',
  idManga, idPlugin, idMangaConnector, idChapterPlugin, volume, previousKnownVolume })`.
- Sem aviso no Telegram.

Como convive com a descoberta paralela (PR #46): cada link continua registrando na hora os
volumes que **não** formam salto em relação ao banco. Volumes que formam salto em relação ao
banco esperam o fim de todos os links (`allSettled`) e são reavaliados contra o conjunto
conhecido completo; os que deixam de ser salto são registrados nessa segunda passada, os demais
viram warn. Assim o caso normal (próximo capítulo contíguo) não espera link lento.

Caso que isto resolve: 171 no banco, Mangeek lista 177, ninguém lista 172–176 → 177 segurado.

Consequência aceita: se uma fonte pular volumes de verdade e nenhuma outra tiver o número, o
volume nunca é baixado; só se percebe pelo buraco.

### 3. Capítulo bloqueado

Tabela nova:

```sql
CREATE TABLE "blockedChapters" (
  "idBlockedChapter" SERIAL PRIMARY KEY,
  "idMangaConnector" INTEGER NOT NULL REFERENCES "mangaConnectors"("idMangaConnector"),
  "idChapterPlugin"  TEXT    NOT NULL,
  "volume"           NUMERIC(14,4) NOT NULL,   -- só exibição
  "reason"           TEXT,                     -- opcional, texto livre
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("idMangaConnector", "idChapterPlugin")
);
```

- Chave do bloqueio: `(idMangaConnector, idChapterPlugin)`. Bloqueia aquele capítulo daquela fonte;
  outro id da mesma fonte com o mesmo volume entra normalmente. Se a fonte renomear o capítulo
  falso para outro número, mesmo id, continua bloqueado.
- A descoberta ignora capítulos bloqueados antes de qualquer outra regra. Bloqueado não conta como
  "conhecido" para a regra de salto (é lixo, não fecha buraco).
- Ação **apagar + bloquear**: em uma operação, insere o bloqueio, apaga a linha de `chapters` e o
  `.cbz` (reusa `MangaAdminService.deleteChapter`), dispara scan da série no Kavita.
- Ação **desbloquear**: apaga a linha de `blockedChapters`. Não dispara descoberta; o capítulo
  volta na próxima varredura normal.

### 4. Baixar de fonte escolhida

- `GET` lista candidatos para um volume: consulta na hora cada link ativo do mangá e devolve, por
  link, se ele lista o volume (e o `idChapterPlugin`/título), ou o motivo de não poder (conector
  desligado, fonte falhou, bloqueado). Inclui o link atual do capítulo (serve para o caso raw →
  tradução na mesma fonte).
- `POST` troca: baixa o capítulo do link escolhido para arquivo temporário; só se o download
  terminar e passar em `placeholderChapter`, troca o `.cbz` e atualiza a linha de `chapters`
  (`idMangaConnector`, `idChapterPlugin`, `name`, `downloadedAt`) na mesma operação. Falha → o
  antigo fica intacto e a API devolve o erro. Depois da troca, scan da série no Kavita.
- A troca não bloqueia o capítulo antigo.

### 5. ADM (manager-apis)

No detalhe do mangá, em cada capítulo:

- **Baixar de outra fonte**: abre diálogo que chama o GET de candidatos (com loading, fontes
  indisponíveis acinzentadas com motivo) e o POST na escolhida.
- **Apagar e bloquear**: confirmação com campo de motivo opcional.

Seção **Bloqueados** no detalhe do mangá: fonte, volume, motivo, data, botão **Desbloquear**.

Sem botão de apagar simples (a rota `DELETE` existente continua, mas não ganha botão).

### 6. Fora de escopo

- Autenticação do ADM: hoje `/mangas/adm/*` (inclusive `DELETE`) responde sem auth. Risco aceito
  pelo usuário em 2026-11-26; frente separada.
- Comparação de conteúdo (soma de alturas das páginas) — reserva se a regra de salto der alarme
  falso demais.
- Prioridade menor para fontes espelho.

## Rotas novas (manager-mangas)

| Método | Rota | Uso |
|---|---|---|
| GET | `/mangas/adm/:idManga/chapters/:idChapter/sources` | Candidatos para trocar fonte |
| POST | `/mangas/adm/:idManga/chapters/:idChapter/replace` | Body `{ idMangaConnector, idChapterPlugin }` |
| POST | `/mangas/adm/:idManga/chapters/:idChapter/block` | Body `{ reason? }` — apaga + bloqueia |
| GET | `/mangas/adm/:idManga/blocked-chapters` | Lista bloqueados |
| DELETE | `/mangas/adm/:idManga/blocked-chapters/:idBlockedChapter` | Desbloqueia |

Validação de entrada nos validators existentes; 404/400 quando capítulo ou link não pertence ao
mangá; 409 quando o conector está desligado.

## Glossário (novos termos)

- **Capítulo segurado**: volume novo que a descoberta não registra porque há buraco entre ele e o
  maior volume conhecido abaixo; sai sozinho quando o buraco fecha ou outra fonte lista o volume.
  _Avoid_: quarentena, suspeito pendente.
- **Capítulo bloqueado**: capítulo específico de um link que a descoberta nunca registra, até ser
  desbloqueado no ADM. _Avoid_: blacklist, ignorado.

## Entrega

1. PR manager-mangas: normalização de volume, regra de salto, `blockedChapters` (migration),
   rotas, scan Kavita. Deploy → **POST /migrations logo após** (Coolify não roda migration).
2. PR manager-apis: diálogo de troca, apagar + bloquear, seção Bloqueados.
3. Pós-deploy: no idManga 15, "apagar e bloquear" o volume 177 (idChapter 1248700). Conferir que a
   varredura seguinte não o reinsere e loga `chapter_held_gap` só se aplicável.

## Testes

- Normalização: `"171.0000"` casa com `"171"`; `"171.5000"` com `"171.5"`.
- Salto: banco {…,171}, link lista {170,171,177} → 177 segurado + warn; outro link lista 172–176 na
  mesma varredura → 177 registrado; outro link lista 177 → registrado; mangá vazio → nada segurado;
  171.5 nunca segurado; link lento não atrasa volume contíguo.
- Bloqueio: capítulo bloqueado não é registrado; outro id mesmo volume mesma fonte é; bloqueado não
  fecha buraco; desbloquear devolve na varredura seguinte.
- Troca: sucesso atualiza linha + arquivo; falha de download ou placeholder mantém antigo;
  link de outro mangá → 400; conector desligado → 409.

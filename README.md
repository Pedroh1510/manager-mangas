# manager-mangas

API REST para gerenciamento e download de mangás, com suporte a centenas de fontes (plugins/connectors). Construída com Node.js, Express, PostgreSQL e Redis.

## Funcionalidades

- Listagem de plugins disponíveis (centenas de fontes de mangá)
- Busca de mangás e capítulos por plugin
- Download de páginas individualmente ou em lote
- Gerenciamento de mangás cadastrados (registro, atualização, remoção)
- Autenticação por cookie e credenciais por plugin
- Fila de downloads assíncrona via BullMQ
- Documentação interativa via Swagger UI (`/api-docs`)
- Painel de filas via Bull Board (`/queues`)

## Tecnologias

- **Runtime:** Node.js 22
- **Framework:** Express
- **Banco de dados:** PostgreSQL
- **Fila:** Redis + BullMQ
- **Web scraping:** Puppeteer
- **Validação:** Joi
- **Linter/Formatter:** Biome
- **Testes:** Vitest
- **Migrations:** node-pg-migrate

## Pré-requisitos

- Node.js 22+
- PostgreSQL
- Redis
- Docker (opcional, recomendado)

## Variáveis de Ambiente

Crie um arquivo `.env.development` na raiz do projeto:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/mangas
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=mangas
POSTGRES_USER=user
POSTGRES_PASSWORD=password
APPLICATION_NAME=manager-mangas
REDIS_HOST=localhost
REDIS_PORT=6379
PORT=3001
URL=http://localhost:3001
URL_DOC=http://localhost:3001
CONCURRENCY=1
ENABLE_JOB=true
```

## Instalação e Execução

### Com Docker (recomendado)

```bash
# Suba apenas os serviços de infraestrutura (PostgreSQL + Redis)
npm run docker:services

# Suba a aplicação completa com hot-reload
npm run docker:dev
```

### Local

```bash
npm install

# Rodar migrations
npm run migrations:up

# Desenvolvimento com hot-reload
npm run dev

# Produção
npm run server
```

## Migrations

```bash
# Listar migrations pendentes
npm run migrations

# Criar nova migration
npm run migrations:create -- nome-da-migration

# Aplicar migrations
npm run migrations:up
```

## API

### Endpoints Públicos

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/status` | Verifica status da API e banco de dados |
| `GET` | `/migrations` | Lista migrations pendentes |
| `POST` | `/migrations` | Aplica migrations pendentes |
| `GET` | `/mangas/plugins` | Lista plugins disponíveis (filtro por `?name=`) |
| `GET` | `/mangas/:pluginId` | Lista mangás de um plugin (filtro por `?title=`) |
| `GET` | `/mangas/:pluginId/manga` | Lista capítulos de um mangá (`?mangaId=`) |
| `GET` | `/mangas/:pluginId/pages` | Lista páginas de um capítulo (`?chapterId=`) |
| `GET` | `/mangas/download` | Download de páginas (`?manga=&chapter=&idChapter=&pages=`) |

### Endpoints de Administração (`/mangas/adm`)

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/mangas/adm` | Cadastra um mangá para acompanhamento |
| `GET` | `/mangas/adm` | Lista mangás cadastrados (filtro por `?title=`) |
| `DELETE` | `/mangas/adm` | Remove um mangá (`?title=`) |
| `POST` | `/mangas/adm/cookie` | Registra cookie de autenticação por plugin |
| `POST` | `/mangas/adm/credentials` | Registra credenciais (login/senha) por plugin |
| `GET` | `/mangas/adm/download` | Download de um mangá (`?title=&volume=`) |
| `GET` | `/mangas/adm/download-batch` | Download em lote (`?title=`) |
| `GET` | `/mangas/adm/update-mangas` | Atualiza capítulos dos mangás cadastrados |
| `GET` | `/mangas/adm/update-mangas/batch` | Atualização em lote por plugin (`?idPlugin=`) |
| `GET` | `/mangas/adm/chapters` | Atualiza capítulos de um mangá (`?title=`) |
| `DELETE` | `/mangas/adm/chapters` | Remove capítulos (`?title=&volume=`) |
| `GET` | `/mangas/adm/chapters/pages` | Lista páginas e envia para fila de download |
| `GET` | `/mangas/adm/chapters/missing` | Lista capítulos faltantes de um mangá |

Documentação completa disponível em `http://localhost:3001/api-docs` após iniciar o servidor.

## Testes

```bash
# Rodar todos os testes
npm test

# Rodar testes dentro do container Docker
npm run docker:app:test
```

## Linter e Formatação

```bash
# Verificar linting
npm run biome:lint

# Corrigir linting automaticamente
npm run biome:lint:fix

# Verificar formatação
npm run biome:format

# Corrigir formatação automaticamente
npm run biome:format:fix

# Verificar tudo (lint + imports)
npm run biome:check:fix
```

## Build e Deploy

```bash
# Build e push da imagem Docker
npm run docker:build:push
```

O arquivo `compose.prod.yml` pode ser usado para ambiente de produção.

## Estrutura do Projeto

```
src/
├── controller/         # Controllers Express (rotas e handlers)
├── model/              # Serviços e regras de negócio
├── repository/         # Acesso ao banco de dados
├── validators/         # Validação de entrada (Joi)
├── infra/
│   ├── engines/
│   │   ├── connectors/ # Plugins de fontes de mangá (500+ fontes)
│   │   └── engine/     # Motor de scraping
│   ├── migrations/     # Migrations do banco de dados
│   ├── database.js     # Configuração do PostgreSQL
│   ├── env.js          # Variáveis de ambiente
│   ├── errors.js       # Classes de erro customizadas
│   ├── logger.js       # Logger (Winston)
│   └── swagger.js      # Configuração do Swagger
├── routes.js           # Roteamento principal
├── jobs.js             # Configuração das filas BullMQ
└── server.js           # Entry point
```

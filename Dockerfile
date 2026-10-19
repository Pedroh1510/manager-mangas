# Digest pinned so builds are reproducible; Dependabot (docker ecosystem) bumps it.
FROM node:26-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5 AS deps
WORKDIR /app
# .npmrc must be present before install so min-release-age/ignore-scripts/engine-strict apply to the build too.
COPY package*.json .npmrc ./
RUN npm ci --omit=dev
# sharp/msgpackr-extract need their install scripts; the allowlist skips the devDeps that aren't installed.
RUN npm rebuild sharp msgpackr-extract --foreground-scripts --ignore-scripts=false

FROM node:26-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5
WORKDIR /app
# No NODE_ENV=production on purpose: infra/env.js falls back to it and would turn on Postgres SSL,
# which the homelab database does not serve.
ENV TZ="America/Sao_Paulo"
RUN apk add --no-cache tzdata
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node src ./src
# Bind mounts land here; uid 1000 (node) must own the host dirs — see PR notes for the one-time chown.
RUN mkdir -p downloads appdata && chown node:node downloads appdata
EXPOSE 3001
USER node
# node fetch instead of curl/wget: no extra binary in the image. Coolify gates deploys on this.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "./src/telemetry.js", "src/server.js"]

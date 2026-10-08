# syntax=docker/dockerfile:1

# Debian rather than Alpine: Prisma's query engine needs glibc and OpenSSL.
FROM node:24-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
# `prisma generate` (run by postinstall) and the build only need this to be set.
ENV DATABASE_URL=file:/tmp/build.db
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
# postinstall ran before the schema was copied in, so generate the client explicitly.
RUN npx prisma generate \
 && npm run build \
 && npm prune --omit=dev

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    # Absolute on purpose: a built app resolves relative `file:` URLs against its bundle.
    DATABASE_URL=file:/data/app.db

# prisma.config.ts (used by `prisma migrate deploy`) lives next to the schema and migrations.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/build ./build
# The bundled client finds the query engine under ./generated/prisma relative to the cwd.
COPY --from=build --chown=node:node /app/generated ./generated
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts /app/package.json ./
RUN mkdir /data && chown node:node /data

USER node
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000)).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Apply any pending migrations (creates the database on a fresh volume), then start.
CMD ["sh", "-c", "npx prisma migrate deploy && node build"]

# Stage 1: Build TypeScript artifacts
FROM node:20-slim AS builder

WORKDIR /app

# Copy package manifests for workspace install
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN npm ci

# Copy API source code
COPY apps/api ./apps/api
COPY contracts ./contracts

# Build API
RUN npm run build -w @hsrr/api

# Stage 2: Production runtime
FROM node:20-slim AS runner

# Install curl for HEALTHCHECK
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV API_PORT=3001

# Copy workspace root manifests and dependencies
COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules

# Copy built API dist, config, migrations, source (for tsx scripts) and scripts
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/src ./apps/api/src
COPY --from=builder /app/apps/api/tsconfig.json ./apps/api/
COPY --from=builder /app/apps/api/drizzle.config.ts ./apps/api/
COPY --from=builder /app/apps/api/scripts ./apps/api/scripts

# Create compatibility symlink and empty env files so npm scripts resolving ../../ work without hardcoded secrets
RUN ln -s /app/node_modules /node_modules \
    && touch /app/.env /.env \
    && chown -R node:node /app /.env

USER node

WORKDIR /app/apps/api

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["node", "dist/main.js"]

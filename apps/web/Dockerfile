# Stage 1: Build Next.js standalone application
FROM node:20-slim AS builder

WORKDIR /app

# Accept API_BASE_URL as build argument (Next.js rewrites destination is fixed at build time)
ARG API_BASE_URL
ENV API_BASE_URL=${API_BASE_URL}

# Validate API_BASE_URL build arg is provided
RUN if [ -z "$API_BASE_URL" ]; then echo "Lỗi build ảnh web: thiếu build-arg API_BASE_URL" && exit 1; fi

# Copy workspace package manifests
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN npm ci

# Copy web source and required contract files
COPY apps/web ./apps/web
COPY contracts ./contracts

# Touch empty env file so node --env-file=../../.env resolves during build
RUN touch /app/.env /.env

# Build web in standalone mode
RUN npm run build -w @hsrr/web

# Stage 2: Production runtime
FROM node:20-slim AS runner

# Install curl for HEALTHCHECK
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy standalone build output and static chunks
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

RUN chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/login || exit 1

CMD ["node", "apps/web/server.js"]

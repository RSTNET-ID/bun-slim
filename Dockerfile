# syntax=docker/dockerfile:1.7
ARG BUN_VERSION=1.4.0
ARG TZ=UTC

# ─────────────────────────────────────────────────────────────────────────────
# STAGE 0: BASE — Alpine Bun Base + Timezone & Utilities
# ─────────────────────────────────────────────────────────────────────────────
FROM oven/bun:${BUN_VERSION}-alpine AS base

ARG TZ
ENV TZ=${TZ}

RUN apk add --no-cache \
    tzdata \
    ca-certificates \
    curl \
    dumb-init \
  && cp /usr/share/zoneinfo/${TZ} /etc/localtime \
  && echo "${TZ}" > /etc/timezone

WORKDIR /app

# ─────────────────────────────────────────────────────────────────────────────
# STAGE 1: DEPS — Install Dependencies with Cache Layering
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS deps

COPY package.json bun.lock* ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    HUSKY=0 bun install --frozen-lockfile

# ─────────────────────────────────────────────────────────────────────────────
# STAGE 2: BUILDER — Typecheck & Compile Standalone Bun Binary
# ─────────────────────────────────────────────────────────────────────────────
FROM deps AS builder

COPY src/ ./src/
COPY database/ ./database/
COPY scripts/ ./scripts/
COPY tsconfig.json eslint.config.js ./

RUN bun run typecheck
RUN bun run build

# ─────────────────────────────────────────────────────────────────────────────
# STAGE 3: PRODUCTION RUNTIME — Ultra-Slim Binary Container
# ─────────────────────────────────────────────────────────────────────────────
FROM alpine:3.22 AS production

ARG TZ
ENV TZ=${TZ}
RUN apk add --no-cache \
    tzdata \
    ca-certificates \
    curl \
    dumb-init \
    libstdc++ \
  && cp /usr/share/zoneinfo/${TZ} /etc/localtime \
  && echo "${TZ}" > /etc/timezone

ARG IMAGE_VERSION=1.0.0
ARG GIT_SHA=unknown
ARG BUILD_DATE=unknown

LABEL org.opencontainers.image.title="Bun Hono Microservice Starter" \
      org.opencontainers.image.description="High-performance Bun + Hono Microservice" \
      org.opencontainers.image.vendor="RST" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_DATE}"

WORKDIR /app
ENV NODE_ENV=production

# Security: Ensure dedicated non-root user/group ownership
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
  && chown -R appuser:appgroup /app

# Copy compiled standalone executable and database assets from builder
COPY --from=builder --chown=appuser:appgroup /app/dist/server ./server
COPY --from=builder --chown=appuser:appgroup /app/dist/worker ./worker
COPY --from=builder --chown=appuser:appgroup /app/dist/scheduler ./scheduler
COPY --from=builder --chown=appuser:appgroup /app/dist/job-dead ./job-dead
COPY --from=builder --chown=appuser:appgroup /app/dist/doctor ./doctor
COPY --from=builder --chown=appuser:appgroup /app/database/ ./database/

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/health/live || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["./server"]

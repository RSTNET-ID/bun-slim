# syntax=docker/dockerfile:1.7
ARG BUN_VERSION=1.4.0

# ─────────────────────────────────────────────────────────────────────────────
# STAGE 0: BASE — Bun build environment, pinned to UTC
# ─────────────────────────────────────────────────────────────────────────────
FROM oven/bun:${BUN_VERSION}-alpine AS base

ENV TZ=UTC

RUN apk add --no-cache \
    tzdata \
    ca-certificates \
  && cp /usr/share/zoneinfo/UTC /etc/localtime \
  && echo "UTC" > /etc/timezone

WORKDIR /app

# ─────────────────────────────────────────────────────────────────────────────
# STAGE 1: DEPS — Install Dependencies with Cache Layering
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS deps

COPY package.json bun.lock* ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    HUSKY=0 bun install --frozen-lockfile

# ─────────────────────────────────────────────────────────────────────────────
# STAGE 2: BUILDER — Typecheck & Compile Standalone Bun Binaries
# ─────────────────────────────────────────────────────────────────────────────
FROM deps AS builder

COPY src/ ./src/
COPY database/ ./database/
COPY scripts/ ./scripts/
COPY tsconfig.json eslint.config.js ./

RUN bun run typecheck
RUN bun run build

# ─────────────────────────────────────────────────────────────────────────────
# STAGE 3: PRODUCTION RUNTIME — Minimal non-root runtime
# ─────────────────────────────────────────────────────────────────────────────
FROM alpine:3.22 AS production

ENV TZ=UTC \
    NODE_ENV=production

RUN apk add --no-cache \
    tzdata \
    ca-certificates \
    curl \
    dumb-init \
    libstdc++ \
  && cp /usr/share/zoneinfo/UTC /etc/localtime \
  && echo "UTC" > /etc/timezone

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

RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
  && chown -R appuser:appgroup /app

COPY --from=builder --chown=appuser:appgroup /app/dist/server ./server
COPY --from=builder --chown=appuser:appgroup /app/dist/worker ./worker
COPY --from=builder --chown=appuser:appgroup /app/dist/scheduler ./scheduler
COPY --from=builder --chown=appuser:appgroup /app/dist/job-dead ./job-dead
COPY --from=builder --chown=appuser:appgroup /app/dist/doctor ./doctor
COPY --from=builder --chown=appuser:appgroup /app/dist/migrate ./migrate
COPY --from=builder --chown=appuser:appgroup /app/dist/seed ./seed

USER appuser

EXPOSE 3000

# Deliberately no image-level HEALTHCHECK. This image serves multiple process
# roles; each deployment must define the health probe appropriate to its command.
ENTRYPOINT ["dumb-init", "--"]
CMD ["./server"]

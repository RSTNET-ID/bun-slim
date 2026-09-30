# Stage 1: Install dependencies
FROM oven/bun:1.4-alpine AS deps
WORKDIR /app

# Copy lockfile dan package manifest terlebih dahulu untuk layer caching optimal.
# Layer ini hanya di-rebuild bila package.json atau bun.lock berubah.
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Stage 2: Runtime image
FROM oven/bun:1.4-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy dependencies dari stage deps
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./

# Copy source code
COPY src/ ./src/

# Security: jalankan sebagai non-root user bawaan oven/bun
USER bun

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health/live || exit 1

CMD ["bun", "src/server.ts"]

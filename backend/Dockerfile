# ── deps stage ────────────────────────────────────────────────────────────────
FROM node:18-bullseye-slim AS deps

WORKDIR /app

RUN apt-get update 
    && apt-get install -y --no-install-recommends openssl ca-certificates 
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci


# ── builder stage ─────────────────────────────────────────────────────────────
FROM node:18-bullseye-slim AS builder

WORKDIR /app

RUN apt-get update 
    && apt-get install -y --no-install-recommends openssl ca-certificates 
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma/
RUN npx prisma generate

COPY src ./src/


# ── runner stage ──────────────────────────────────────────────────────────────
FROM node:18-bullseye-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update 
    && apt-get install -y --no-install-recommends openssl ca-certificates wget 
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system appgroup 
    && useradd --system --gid appgroup --home-dir /app appuser

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

COPY --from=builder /app/src ./src
COPY prisma ./prisma/
COPY package.json package-lock.json ./

RUN mkdir -p src/uploads 
    && chown -R appuser:appgroup /app

USER appuser

EXPOSE 5001

CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]

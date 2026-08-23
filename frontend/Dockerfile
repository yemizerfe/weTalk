# ── builder stage ─────────────────────────────────────────────────────────────
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# ── runner stage (Node.js static server - no nginx) ───────────────────────────
FROM node:18-alpine AS runner
WORKDIR /app

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy built assets
COPY --from=builder /app/dist ./dist

# Copy custom static file server with SPA fallback
COPY server.js ./server.js

# Set ownership
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

# Run custom Node.js static server with SPA fallback
CMD ["node", "server.js"]
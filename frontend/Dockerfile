# =============================================================================
# BPM & SpO₂ Monitoring Dashboard — Frontend Dockerfile
# Multi-stage: build → nginx
# =============================================================================

# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# Copy dependency manifests for layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code and config files
COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY vite.config.ts tailwind.config.js postcss.config.js ./
COPY index.html ./
COPY public/ ./public/
COPY src/ ./src/

# Build the application (TypeScript compile + Vite bundle)
RUN npm run build

# ─── Stage 2: Nginx Production Server ────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static assets from the build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Create non-root nginx user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup && \
    chown -R appuser:appgroup /usr/share/nginx/html /var/cache/nginx /var/run

USER appuser

# Expose HTTP port
EXPOSE 80

# Health check — nginx returns 200 on the main page
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 -O /dev/null http://localhost:80/ || exit 1

# Start nginx in foreground
CMD ["nginx", "-g", "daemon off;"]

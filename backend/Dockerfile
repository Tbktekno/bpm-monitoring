# =============================================================================
# BPM & SpO₂ Monitoring Dashboard — Backend Dockerfile
# Multi-stage: deps → build → production
# =============================================================================

# ─── Stage 1: Production Dependencies ─────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Copy only dependency manifests for layer caching
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts

# ─── Stage 2: Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# Copy dependency manifests and install ALL deps (including dev)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code, Prisma schema, and gRPC proto files
COPY tsconfig.json ./
COPY src/ ./src/
COPY prisma/ ./prisma/
COPY proto/ ./proto/

# Generate Prisma client and compile TypeScript
RUN npx prisma generate
RUN npm run build

# ─── Stage 3: Production Runner ──────────────────────────────────────────────
FROM node:22-alpine AS runner

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Copy production artifacts from previous stages
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/proto ./proto
COPY --from=build /app/package.json ./

# Switch to non-root user
USER appuser

# Expose Express (5000) and gRPC (50051) ports
EXPOSE 5000
EXPOSE 50051

# Health check — hits the /api/health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:5000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Set Node.js to production mode
ENV NODE_ENV=production

# Start the server
CMD ["node", "dist/src/index.js"]

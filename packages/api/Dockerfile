# Multi-stage build for ADO API Server

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/api/package.json ./packages/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/core/package.json ./packages/core/

# Install dependencies
RUN pnpm install --frozen-lockfile --filter @ado/api... --filter @ado/shared... --filter @ado/core...

# Copy source files
COPY packages/shared ./packages/shared
COPY packages/core ./packages/core
COPY packages/api ./packages/api
COPY tsconfig.json ./
COPY biome.json ./

# Build packages
RUN pnpm --filter @ado/shared build
RUN pnpm --filter @ado/core build
RUN pnpm --filter @ado/api build

# Stage 2: Production
FROM node:22-alpine AS production

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9

# Copy built artifacts
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/api/package.json ./packages/api/
COPY --from=builder /app/packages/api/dist ./packages/api/dist

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod --filter @ado/api... --filter @ado/shared... --filter @ado/core...

# Set environment
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Run the API server
CMD ["node", "packages/api/dist/index.js"]


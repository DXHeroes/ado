# Agentic Development Orchestrator (ADO)
# Multi-stage Docker build for production deployment

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:22-alpine AS deps

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/cli/package.json ./packages/cli/
COPY packages/api/package.json ./packages/api/
COPY packages/adapters/package.json ./packages/adapters/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies (production only)
RUN pnpm install --frozen-lockfile --prod

# ============================================
# Stage 2: Builder
# ============================================
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/cli/package.json ./packages/cli/
COPY packages/api/package.json ./packages/api/
COPY packages/adapters/package.json ./packages/adapters/
COPY packages/shared/package.json ./packages/shared/

# Install all dependencies (including dev)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build all packages
RUN pnpm build

# ============================================
# Stage 3: Runtime
# ============================================
FROM node:22-alpine AS runtime

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Install system dependencies for agent execution
RUN apk add --no-cache \
    git \
    bash \
    curl \
    ca-certificates \
    python3 \
    make \
    g++

# Create non-root user
RUN addgroup -g 1001 -S ado && \
    adduser -S -u 1001 -G ado ado

# Set working directory
WORKDIR /app

# Copy production dependencies from deps stage
COPY --from=deps --chown=ado:ado /app/node_modules ./node_modules
COPY --from=deps --chown=ado:ado /app/package.json ./package.json

# Copy built artifacts from builder stage
COPY --from=builder --chown=ado:ado /app/packages/core/dist ./packages/core/dist
COPY --from=builder --chown=ado:ado /app/packages/core/package.json ./packages/core/
COPY --from=builder --chown=ado:ado /app/packages/cli/dist ./packages/cli/dist
COPY --from=builder --chown=ado:ado /app/packages/cli/package.json ./packages/cli/
COPY --from=builder --chown=ado:ado /app/packages/api/dist ./packages/api/dist
COPY --from=builder --chown=ado:ado /app/packages/api/package.json ./packages/api/
COPY --from=builder --chown=ado:ado /app/packages/adapters/dist ./packages/adapters/dist
COPY --from=builder --chown=ado:ado /app/packages/adapters/package.json ./packages/adapters/
COPY --from=builder --chown=ado:ado /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=ado:ado /app/packages/shared/package.json ./packages/shared/

# Copy workspace and lock file
COPY --from=builder --chown=ado:ado /app/pnpm-workspace.yaml ./
COPY --from=builder --chown=ado:ado /app/pnpm-lock.yaml ./

# Create data directories
RUN mkdir -p /app/data /app/logs /app/tmp && \
    chown -R ado:ado /app/data /app/logs /app/tmp

# Switch to non-root user
USER ado

# Set environment variables
ENV NODE_ENV=production \
    ADO_DATA_DIR=/app/data \
    ADO_LOG_DIR=/app/logs \
    ADO_TMP_DIR=/app/tmp

# Expose port for API server
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Default command: Run API server
ENTRYPOINT ["node", "packages/api/dist/index.js"]

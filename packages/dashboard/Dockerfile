# Multi-stage build for ADO Dashboard

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY packages/dashboard/package.json ./packages/dashboard/
COPY packages/shared/package.json ./packages/shared/
COPY packages/core/package.json ./packages/core/

# Install dependencies
RUN pnpm install --frozen-lockfile --filter @ado/dashboard... --filter @ado/shared... --filter @ado/core...

# Copy source files
COPY packages/shared ./packages/shared
COPY packages/core ./packages/core
COPY packages/dashboard ./packages/dashboard
COPY tsconfig.json ./
COPY biome.json ./

# Build shared and core first
RUN pnpm --filter @ado/shared build
RUN pnpm --filter @ado/core build

# Build dashboard
RUN pnpm --filter @ado/dashboard build

# Stage 2: Production
FROM nginx:alpine AS production

# Copy built files
COPY --from=builder /app/packages/dashboard/dist /usr/share/nginx/html

# Copy nginx config
COPY packages/dashboard/nginx.conf /etc/nginx/conf.d/default.conf

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]


# Docker Compose Deployment

## Přehled

Průvodce nasazením ADO pomocí Docker Compose pro lokální development a menší produkční nasazení.

## Předpoklady

- Docker 24.0+
- Docker Compose 2.20+
- 8GB RAM minimum
- 20GB disk space

## Quick Start

```bash
# Klonování repo
git clone https://github.com/dxheroes/ado.git
cd ado/deploy/docker

# Konfigurace
cp .env.example .env
# Upravte .env

# Spuštění
docker compose up -d

# Ověření
docker compose ps
curl http://localhost:3000/health
```

## Docker Compose konfigurace

### docker-compose.yaml

```yaml
version: '3.8'

services:
  # ═══════════════════════════════════════════════════════
  # API Gateway
  # ═══════════════════════════════════════════════════════
  api-gateway:
    image: ghcr.io/dxheroes/ado/api-gateway:${ADO_VERSION:-latest}
    ports:
      - "3000:3000"      # HTTP API
      - "3001:3001"      # WebSocket
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://ado:${DB_PASSWORD}@postgres:5432/ado
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - CORS_ORIGINS=${CORS_ORIGINS:-http://localhost:8080}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped

  # ═══════════════════════════════════════════════════════
  # Orchestrator
  # ═══════════════════════════════════════════════════════
  orchestrator:
    image: ghcr.io/dxheroes/ado/orchestrator:${ADO_VERSION:-latest}
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://ado:${DB_PASSWORD}@postgres:5432/ado
      - REDIS_URL=redis://redis:6379
      - WORKER_COUNT=${WORKER_COUNT:-3}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - workspaces:/app/workspaces
    restart: unless-stopped

  # ═══════════════════════════════════════════════════════
  # Workers
  # ═══════════════════════════════════════════════════════
  worker:
    image: ghcr.io/dxheroes/ado/worker:${ADO_VERSION:-latest}
    deploy:
      replicas: ${WORKER_REPLICAS:-3}
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '0.5'
          memory: 1G
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://ado:${DB_PASSWORD}@postgres:5432/ado
      - REDIS_URL=redis://redis:6379
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - GOOGLE_AI_API_KEY=${GOOGLE_AI_API_KEY}
    depends_on:
      - orchestrator
    volumes:
      - workspaces:/app/workspaces
      - /var/run/docker.sock:/var/run/docker.sock:ro  # Pro agent isolation
    restart: unless-stopped

  # ═══════════════════════════════════════════════════════
  # Dashboard (Optional)
  # ═══════════════════════════════════════════════════════
  dashboard:
    image: ghcr.io/dxheroes/ado/dashboard:${ADO_VERSION:-latest}
    ports:
      - "8080:80"
    environment:
      - API_URL=http://api-gateway:3000
      - WS_URL=ws://api-gateway:3001
    depends_on:
      - api-gateway
    restart: unless-stopped

  # ═══════════════════════════════════════════════════════
  # PostgreSQL
  # ═══════════════════════════════════════════════════════
  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=ado
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=ado
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ado"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  # ═══════════════════════════════════════════════════════
  # Redis
  # ═══════════════════════════════════════════════════════
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  workspaces:

networks:
  default:
    name: ado-network
```

### .env soubor

```bash
# .env

# ADO Version
ADO_VERSION=2.0.0

# Database
DB_PASSWORD=your-secure-password-here

# Security
JWT_SECRET=your-jwt-secret-min-32-chars

# CORS
CORS_ORIGINS=http://localhost:8080,https://your-domain.com

# Workers
WORKER_COUNT=3
WORKER_REPLICAS=3

# AI Providers (alespoň jeden je povinný)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=...

# Optional: Telemetry
TELEMETRY_ENABLED=true
```

## Profily nasazení

### Development

```yaml
# docker-compose.dev.yaml
version: '3.8'

services:
  api-gateway:
    build:
      context: ../..
      dockerfile: packages/api/Dockerfile
    volumes:
      - ../../packages:/app/packages:ro
    environment:
      - NODE_ENV=development
      - LOG_LEVEL=debug

  worker:
    deploy:
      replicas: 1
    environment:
      - LOG_LEVEL=debug
```

```bash
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up
```

### Production

```yaml
# docker-compose.prod.yaml
version: '3.8'

services:
  api-gateway:
    deploy:
      replicas: 2
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  worker:
    deploy:
      replicas: 5

  # Nginx reverse proxy
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - api-gateway
      - dashboard
```

```bash
docker compose -f docker-compose.yaml -f docker-compose.prod.yaml up -d
```

## Správa

### Základní příkazy

```bash
# Start
docker compose up -d

# Stop
docker compose down

# Restart
docker compose restart

# Logs
docker compose logs -f api-gateway
docker compose logs -f worker

# Scale workers
docker compose up -d --scale worker=5

# Status
docker compose ps
```

### Database migrations

```bash
# Spuštění migrací
docker compose exec api-gateway npx prisma migrate deploy

# Reset databáze (POZOR: smaže data)
docker compose exec api-gateway npx prisma migrate reset
```

### Backup

```bash
# Backup PostgreSQL
docker compose exec postgres pg_dump -U ado ado > backup.sql

# Restore
cat backup.sql | docker compose exec -T postgres psql -U ado ado

# Backup Redis
docker compose exec redis redis-cli BGSAVE
docker cp $(docker compose ps -q redis):/data/dump.rdb ./redis-backup.rdb
```

### Update

```bash
# Pull new images
docker compose pull

# Restart with new images
docker compose up -d

# Nebo rolling update
docker compose up -d --no-deps api-gateway
docker compose up -d --no-deps worker
```

## Monitoring

### Health checks

```bash
# API health
curl http://localhost:3000/health

# Detailní health
curl http://localhost:3000/health/detailed

# Response:
{
  "status": "healthy",
  "components": {
    "database": "up",
    "redis": "up",
    "workers": "3/3 healthy"
  }
}
```

### Přidání Prometheus/Grafana

```yaml
# docker-compose.monitoring.yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3030:3000"
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-admin}

volumes:
  prometheus_data:
  grafana_data:
```

## Troubleshooting

### Container won't start

```bash
# Zkontrolujte logy
docker compose logs api-gateway

# Zkontrolujte konfigurace
docker compose config

# Validate .env
docker compose config --quiet
```

### Database connection issues

```bash
# Test připojení
docker compose exec api-gateway npx prisma db pull

# Zkontrolujte síť
docker network inspect ado-network
```

### Performance issues

```bash
# Statistiky containerů
docker stats

# Zvyšte resources
# V docker-compose.yaml upravte deploy.resources
```

---

## Souvislosti

- [Kubernetes Deployment](./kubernetes.md)
- [Coolify Deployment](./coolify.md)
- [Monitoring: Metrics](../02-monitoring/metrics.md)

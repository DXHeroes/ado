# Docker Deployment Guide

Quick guide for deploying ADO using Docker and Docker Compose.

## Available Images

ADO provides three Docker images published to both Docker Hub and GitHub Container Registry:

| Image | Docker Hub | GitHub Container Registry |
|-------|------------|---------------------------|
| Main (CLI + API) | `dxheroes/ado` | `ghcr.io/dxheroes/ado` |
| API Server | `dxheroes/ado-api` | `ghcr.io/dxheroes/ado-api` |
| Dashboard | `dxheroes/ado-dashboard` | `ghcr.io/dxheroes/ado-dashboard` |

## Quick Start

### 1. Pull Images

```bash
# From Docker Hub (recommended)
docker pull dxheroes/ado:latest
docker pull dxheroes/ado-api:latest
docker pull dxheroes/ado-dashboard:latest

# Or from GitHub Container Registry
docker pull ghcr.io/dxheroes/ado:latest
```

### 2. Run API Server

```bash
docker run -d \
  --name ado-api \
  -p 8080:8080 \
  -e DATABASE_URL=postgresql://user:pass@localhost:5432/ado \
  -e ANTHROPIC_API_KEY=your-key-here \
  dxheroes/ado:latest
```

### 3. Run Dashboard

```bash
docker run -d \
  --name ado-dashboard \
  -p 3000:3000 \
  -e VITE_API_URL=http://localhost:8080 \
  dxheroes/ado-dashboard:latest
```

## Docker Compose (Production)

### Setup

1. **Navigate to deployment directory**:
   ```bash
   cd deploy/coolify
   ```

2. **Copy environment template**:
   ```bash
   cp .env.example .env
   ```

3. **Edit configuration**:
   ```bash
   # Required variables
   POSTGRES_PASSWORD=your-secure-password
   JWT_SECRET=$(openssl rand -hex 32)
   ADO_API_KEY=$(openssl rand -hex 32)

   # AI Provider Keys
   ANTHROPIC_API_KEY=sk-ant-...
   GOOGLE_API_KEY=AIza...
   ```

4. **Start services**:
   ```bash
   # Basic setup (API + Database + Redis)
   docker-compose up -d

   # With dashboard
   docker-compose --profile dashboard up -d

   # Full setup (all services)
   docker-compose --profile full --profile dashboard --profile observability up -d
   ```

### Services

The docker-compose setup includes:

- **postgres** - PostgreSQL 16 database
- **redis** - Redis cache & queue
- **api** - ADO API server (port 8080)
- **worker-claude** - Claude Code workers (2 replicas)
- **worker-gemini** - Gemini CLI workers (optional)
- **dashboard** - Web UI (port 3000, optional)
- **jaeger** - Distributed tracing (port 16686, optional)
- **postgres-backup** - Automated backups (optional)

### Profiles

Use Docker Compose profiles to start only needed services:

```bash
# API + Database + Workers (default)
docker-compose up -d

# + Dashboard
docker-compose --profile dashboard up -d

# + Full worker set (Claude + Gemini)
docker-compose --profile full up -d

# + Observability (Jaeger tracing)
docker-compose --profile observability up -d

# + Automated backups
docker-compose --profile backup up -d

# Everything
docker-compose --profile full --profile dashboard --profile observability --profile backup up -d
```

## Environment Variables

### Required

```bash
# Database
POSTGRES_PASSWORD=secure-password

# Security
JWT_SECRET=random-secret
ADO_API_KEY=api-key

# At least one AI provider
ANTHROPIC_API_KEY=sk-ant-...
# OR
GOOGLE_API_KEY=AIza...
# OR
OPENAI_API_KEY=sk-...
```

### Optional

```bash
# Worker configuration
WORKER_MODE=subscription          # subscription or api
WORKER_CLAUDE_REPLICAS=2          # Number of Claude workers
WORKER_MAX_TASKS=3                # Concurrent tasks per worker

# Git (for workers)
GIT_USER_NAME=ADO Worker
GIT_USER_EMAIL=ado@example.com

# Dashboard URLs
DASHBOARD_API_URL=https://ado.yourcompany.com
DASHBOARD_WS_URL=wss://ado.yourcompany.com

# Observability
LOG_LEVEL=info
ENABLE_TRACING=false
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318

# Security
CORS_ORIGIN=*
RATE_LIMIT_MAX=100

# Backups
BACKUP_SCHEDULE=@daily
BACKUP_KEEP_DAYS=7
```

## Common Operations

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f worker-claude

# Last 100 lines
docker-compose logs --tail=100 api
```

### Scale Workers

```bash
# Scale Claude workers to 5
docker-compose up -d --scale worker-claude=5

# Or edit .env
WORKER_CLAUDE_REPLICAS=5
docker-compose up -d
```

### Health Checks

```bash
# API health
curl http://localhost:8080/health

# Check all services
docker-compose ps

# Detailed service info
docker inspect ado-api
```

### Database Access

```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U ado -d ado

# Run SQL query
docker-compose exec postgres psql -U ado -d ado -c "SELECT * FROM tasks LIMIT 10;"

# Database backup (manual)
docker-compose exec postgres pg_dump -U ado ado > backup.sql

# Restore
docker-compose exec -T postgres psql -U ado ado < backup.sql
```

### Updates

```bash
# Pull latest images
docker-compose pull

# Restart with new images
docker-compose up -d

# Or specific service
docker-compose pull api
docker-compose up -d api
```

## Storage & Persistence

Volumes created by docker-compose:

- `postgres-data` - PostgreSQL database
- `redis-data` - Redis cache
- `worker-workspace` - Worker execution workspace
- `jaeger-data` - Jaeger traces (if enabled)

### Backup Volumes

```bash
# Backup PostgreSQL data
docker run --rm -v ado_postgres-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/postgres-backup.tar.gz -C /data .

# Restore
docker run --rm -v ado_postgres-data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/postgres-backup.tar.gz -C /data
```

## Security Considerations

### 1. Use Strong Secrets

```bash
# Generate secure secrets
openssl rand -hex 32  # For JWT_SECRET, ADO_API_KEY, SESSION_SECRET
openssl rand -base64 32  # For POSTGRES_PASSWORD
```

### 2. Restrict CORS

```bash
# Production
CORS_ORIGIN=https://yourcompany.com

# Development
CORS_ORIGIN=http://localhost:3000
```

### 3. Use HTTPS

In production, run behind a reverse proxy (nginx, Traefik, Caddy):

```yaml
# docker-compose.override.yml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
```

### 4. Network Isolation

```bash
# Create custom network
docker network create ado-internal

# Update docker-compose.yml to use internal network
# Don't expose database ports externally
```

### 5. Resource Limits

Already configured in docker-compose.yml:

```yaml
worker-claude:
  deploy:
    resources:
      limits:
        cpus: '2'
        memory: 4G
      reservations:
        cpus: '0.5'
        memory: 1G
```

## Troubleshooting

### Services Won't Start

```bash
# Check logs
docker-compose logs

# Check specific service
docker-compose logs api

# Validate compose file
docker-compose config
```

### Database Connection Failed

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Test connection
docker-compose exec postgres pg_isready -U ado

# Check credentials in .env
grep POSTGRES .env
```

### Worker Not Connecting

```bash
# Check worker logs
docker-compose logs worker-claude

# Verify API is accessible
docker-compose exec worker-claude curl http://api:8080/health

# Check API key
grep ADO_API_KEY .env
```

### Out of Memory

```bash
# Check resource usage
docker stats

# Reduce worker replicas
WORKER_CLAUDE_REPLICAS=1

# Or reduce tasks per worker
WORKER_MAX_TASKS=1
```

### Port Already in Use

```bash
# Find what's using port 8080
lsof -i :8080

# Change port in docker-compose.yml
ports:
  - "8081:8080"  # Map to different host port
```

## Monitoring

### Health Endpoints

- API: `http://localhost:8080/health`
- Dashboard: `http://localhost:3000/health`

### Metrics

```bash
# API metrics (if enabled)
curl http://localhost:8080/metrics

# Or with Prometheus format
curl -H "Accept: application/openmetrics-text" http://localhost:8080/metrics
```

### Jaeger UI

If using observability profile:

```bash
# Open Jaeger UI
open http://localhost:16686

# Or via curl
curl http://localhost:16686/api/services
```

## Production Checklist

- [ ] Use specific version tags, not `:latest`
- [ ] Generate secure secrets for all required variables
- [ ] Configure proper CORS origin
- [ ] Set up HTTPS with reverse proxy
- [ ] Enable automated backups (`--profile backup`)
- [ ] Configure resource limits per service
- [ ] Set up monitoring and alerting
- [ ] Enable distributed tracing for debugging
- [ ] Use internal Docker network for database
- [ ] Regular security updates (`docker-compose pull`)
- [ ] Monitor disk usage for volumes
- [ ] Set up log rotation
- [ ] Configure rate limiting
- [ ] Review and restrict API key permissions

## Advanced Configuration

### Custom Network

```yaml
# docker-compose.override.yml
networks:
  ado-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/16
```

### External Database

```yaml
# Use external PostgreSQL
services:
  api:
    environment:
      DATABASE_URL: postgresql://user:pass@external-db.example.com:5432/ado
# Remove postgres service
```

### SSL Certificates

```yaml
services:
  api:
    volumes:
      - ./ssl/cert.pem:/app/ssl/cert.pem:ro
      - ./ssl/key.pem:/app/ssl/key.pem:ro
    environment:
      SSL_CERT_PATH: /app/ssl/cert.pem
      SSL_KEY_PATH: /app/ssl/key.pem
```

## Migration

### From Development to Production

1. Export development data:
   ```bash
   docker-compose exec postgres pg_dump -U ado ado > dev-data.sql
   ```

2. Start production stack:
   ```bash
   cd deploy/coolify
   docker-compose --profile production up -d
   ```

3. Import data:
   ```bash
   docker-compose exec -T postgres psql -U ado ado < dev-data.sql
   ```

### Version Upgrades

```bash
# 1. Backup current data
docker-compose exec postgres pg_dump -U ado ado > backup-$(date +%Y%m%d).sql

# 2. Pull new version
docker-compose pull

# 3. Stop services
docker-compose down

# 4. Start with new version
docker-compose up -d

# 5. Verify
curl http://localhost:8080/health
docker-compose logs -f
```

## References

- [Release Workflow](./RELEASE-WORKFLOW.md) - Image publishing and versioning
- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [PostgreSQL Docker Hub](https://hub.docker.com/_/postgres)
- [Redis Docker Hub](https://hub.docker.com/_/redis)

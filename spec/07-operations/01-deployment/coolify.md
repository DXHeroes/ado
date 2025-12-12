# Coolify Deployment

## Přehled

Průvodce nasazením ADO na Coolify - self-hosted PaaS alternativa k Vercel/Netlify.

## Předpoklady

- Coolify instance (v4+)
- Server s min. 4GB RAM, 2 vCPU
- Domain s DNS přístupem
- SSL certifikát (Coolify automaticky přes Let's Encrypt)

## Quick Start

### 1. Příprava Coolify

```bash
# Instalace Coolify (pokud nemáte)
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

### 2. Vytvoření projektu

1. Otevřete Coolify dashboard
2. **Projects** → **New Project**
3. Pojmenujte: `ado-production`

### 3. Přidání databází

#### PostgreSQL

1. **Resources** → **New Resource** → **Database** → **PostgreSQL**
2. Konfigurace:
   ```yaml
   Name: ado-postgres
   Version: 16
   Database: ado
   Username: ado
   Password: [generate secure]
   ```
3. **Deploy**

#### Redis

1. **Resources** → **New Resource** → **Database** → **Redis**
2. Konfigurace:
   ```yaml
   Name: ado-redis
   Version: 7
   ```
3. **Deploy**

### 4. Nasazení ADO služeb

#### API Gateway

1. **Resources** → **New Resource** → **Application**
2. Vyberte **Docker Image**
3. Konfigurace:
   ```yaml
   Name: ado-api-gateway
   Image: ghcr.io/dxheroes/ado/api-gateway:latest

   Ports:
     - 3000:3000  # HTTP
     - 3001:3001  # WebSocket

   Environment Variables:
     NODE_ENV: production
     DATABASE_URL: postgresql://ado:PASSWORD@ado-postgres:5432/ado
     REDIS_URL: redis://ado-redis:6379
     JWT_SECRET: your-secret

   Health Check:
     Path: /health
     Port: 3000
   ```

#### Orchestrator

1. **Resources** → **New Resource** → **Application**
2. Konfigurace:
   ```yaml
   Name: ado-orchestrator
   Image: ghcr.io/dxheroes/ado/orchestrator:latest

   Environment Variables:
     NODE_ENV: production
     DATABASE_URL: postgresql://ado:PASSWORD@ado-postgres:5432/ado
     REDIS_URL: redis://ado-redis:6379

   Volumes:
     - /data/ado/workspaces:/app/workspaces
   ```

#### Worker

1. **Resources** → **New Resource** → **Application**
2. Konfigurace:
   ```yaml
   Name: ado-worker
   Image: ghcr.io/dxheroes/ado/worker:latest
   Replicas: 3

   Environment Variables:
     NODE_ENV: production
     DATABASE_URL: postgresql://ado:PASSWORD@ado-postgres:5432/ado
     REDIS_URL: redis://ado-redis:6379
     ANTHROPIC_API_KEY: sk-ant-...

   Resources:
     CPU Limit: 2
     Memory Limit: 4096

   Volumes:
     - /data/ado/workspaces:/app/workspaces
   ```

#### Dashboard

1. **Resources** → **New Resource** → **Application**
2. Konfigurace:
   ```yaml
   Name: ado-dashboard
   Image: ghcr.io/dxheroes/ado/dashboard:latest

   Ports:
     - 80:80

   Environment Variables:
     API_URL: https://api.your-domain.com
     WS_URL: wss://api.your-domain.com
   ```

### 5. Konfigurace domény

1. V každé službě → **Settings** → **Domains**
2. Přidejte domény:
   - API: `api.your-domain.com`
   - Dashboard: `ado.your-domain.com`
3. Povolte **SSL** (Let's Encrypt)

### 6. DNS konfigurace

```
Type    Name        Value
A       api         YOUR_SERVER_IP
A       ado         YOUR_SERVER_IP
```

## Docker Compose pro Coolify

Alternativně můžete použít Docker Compose:

```yaml
# coolify-docker-compose.yaml
version: '3.8'

services:
  api-gateway:
    image: ghcr.io/dxheroes/ado/api-gateway:latest
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - JWT_SECRET=${JWT_SECRET}
    labels:
      - "coolify.managed=true"
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`api.${DOMAIN}`)"
      - "traefik.http.routers.api.tls=true"
      - "traefik.http.services.api.loadbalancer.server.port=3000"

  orchestrator:
    image: ghcr.io/dxheroes/ado/orchestrator:latest
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    volumes:
      - workspaces:/app/workspaces

  worker:
    image: ghcr.io/dxheroes/ado/worker:latest
    deploy:
      replicas: 3
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    volumes:
      - workspaces:/app/workspaces

  dashboard:
    image: ghcr.io/dxheroes/ado/dashboard:latest
    environment:
      - API_URL=https://api.${DOMAIN}
    labels:
      - "coolify.managed=true"
      - "traefik.enable=true"
      - "traefik.http.routers.dashboard.rule=Host(`ado.${DOMAIN}`)"
      - "traefik.http.routers.dashboard.tls=true"

volumes:
  workspaces:
```

Import do Coolify:
1. **Resources** → **New Resource** → **Docker Compose**
2. Vložte YAML
3. Nastavte environment variables
4. **Deploy**

## Environment Variables

```bash
# Required
DATABASE_URL=postgresql://ado:password@ado-postgres:5432/ado
REDIS_URL=redis://ado-redis:6379
JWT_SECRET=your-secure-jwt-secret

# AI Providers (alespoň jeden)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=...

# Domain
DOMAIN=your-domain.com

# Optional
NODE_ENV=production
LOG_LEVEL=info
TELEMETRY_ENABLED=true
```

## Škálování

### Manuální škálování

1. Otevřete **ado-worker** resource
2. **Settings** → **Replicas**
3. Nastavte počet (např. 5)
4. **Save** & **Redeploy**

### Auto-scaling (Coolify v4+)

```yaml
# V resource settings
Scaling:
  Min Replicas: 2
  Max Replicas: 10
  CPU Threshold: 70%
  Memory Threshold: 80%
```

## Monitoring

### Coolify Metrics

Coolify automaticky sbírá metriky:
- CPU usage
- Memory usage
- Network I/O
- Disk I/O

### Custom Metrics

1. Přidejte Prometheus endpoint do ADO
2. V Coolify: **Settings** → **Monitoring** → **Custom Metrics**
3. URL: `http://ado-api-gateway:9090/metrics`

## Backup

### Databáze

```bash
# Coolify automaticky vytváří backupy
# Settings → Backup → Configure

# Manuální backup
coolify db:backup ado-postgres
```

### Volumes

```bash
# Backup workspace volume
tar -czvf workspaces-backup.tar.gz /data/ado/workspaces
```

## Update

### Automatické updaty

1. **Resource** → **Settings** → **Auto Update**
2. Povolte **Watch for new images**
3. Nastavte **Update Policy**: `minor` nebo `patch`

### Manuální update

1. Změňte image tag: `ghcr.io/dxheroes/ado/api-gateway:2.1.0`
2. **Redeploy**

## Troubleshooting

### Služba se nespustí

```bash
# Zkontrolujte logy v Coolify
Resource → Logs

# SSH na server
coolify ssh
docker logs ado-api-gateway
```

### Database connection failed

1. Zkontrolujte, že PostgreSQL běží
2. Ověřte DATABASE_URL
3. Zkontrolujte network connectivity

### SSL issues

1. Zkontrolujte DNS propagaci: `dig api.your-domain.com`
2. Obnovte certifikát: **Settings** → **SSL** → **Renew**

---

## Souvislosti

- [Docker Compose Deployment](./docker-compose.md)
- [Kubernetes Deployment](./kubernetes.md)
- [Monitoring: Metrics](../02-monitoring/metrics.md)

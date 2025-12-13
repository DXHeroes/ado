# Coolify Deployment Guide

Deploy ADO on Coolify for team collaboration with remote workers.

## Overview

Coolify provides a simple alternative to Kubernetes for deploying ADO with remote workers. Perfect for small-to-medium teams who want shared worker pools without K8s complexity.

```
┌──────────────────────────────────────────────────────────┐
│                    Your Laptop (Local)                    │
│                                                           │
│  ┌────────┐                                              │
│  │  CLI   │ ──── git clone ──── │ Your Code │           │
│  └───┬────┘                                              │
│      │                                                    │
│      │ ado run "task" --remote                           │
│      │                                                    │
└──────┼──────────────────────────────────────────────────┘
       │
       │ HTTPS/WSS
       │
┌──────▼──────────────────────────────────────────────────┐
│              Coolify (Cloud Server)                      │
│                                                           │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │ API Gateway  │   │ PostgreSQL   │   │    Redis     │ │
│  │ (tRPC + WS)  │   │   (State)    │   │   (Queue)    │ │
│  └──────┬───────┘   └──────────────┘   └──────────────┘ │
│         │                                                │
│         ▼                                                │
│  ┌─────────────────────────────────────────────────────┐ │
│  │           Worker Pool (3-10 workers)                 │ │
│  │                                                      │ │
│  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐    │ │
│  │  │Worker 1│  │Worker 2│  │Worker 3│  │Worker N│    │ │
│  │  │Claude  │  │Gemini  │  │Cursor  │  │ Any    │    │ │
│  │  └────────┘  └────────┘  └────────┘  └────────┘    │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

## Why Coolify + Remote Workers?

### Use Cases

1. **Team Collaboration** - Share worker pool across team
2. **Subscription Pooling** - Share Claude MAX/Cursor Pro subscriptions
3. **Bigger Tasks** - Remote workers have more CPU/RAM
4. **Parallel Execution** - Run 10+ tasks simultaneously
5. **Cost Optimization** - Centralized cost tracking and limits
6. **Always On** - Tasks continue even if you close laptop

### Local vs Remote vs Hybrid

| Mode | Code Location | Execution | Use Case |
|------|---------------|-----------|----------|
| **Local** | Local | Local | Individual dev, small tasks |
| **Remote** | Remote Git | Remote | CI/CD, automation |
| **Hybrid** ⭐ | **Local** | **Remote** | **Team dev (recommended)** |

**Hybrid mode** is the sweet spot - you keep your code locally, but execution happens on powerful remote workers.

## Prerequisites

- Coolify instance (self-hosted or cloud)
- Domain name (e.g., `ado.yourcompany.com`)
- Server with Docker support (2GB RAM minimum, 4GB+ recommended)

## Quick Start

### 1. Deploy to Coolify

#### Option A: Using Coolify UI

1. Go to your Coolify dashboard
2. Create new **Resource** → **Docker Compose**
3. Paste this docker-compose.yml:

```yaml
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ado
      POSTGRES_USER: ado
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ado"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis Cache & Queue
  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ADO API Gateway
  api:
    image: ghcr.io/dxheroes/ado:latest
    command: ["node", "packages/api/dist/index.js"]
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://ado:${POSTGRES_PASSWORD}@postgres:5432/ado
      REDIS_URL: redis://redis:6379

      # API Keys (set these in Coolify secrets)
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      GOOGLE_API_KEY: ${GOOGLE_API_KEY}
      OPENAI_API_KEY: ${OPENAI_API_KEY}

      # Authentication
      JWT_SECRET: ${JWT_SECRET}
      API_KEY: ${ADO_API_KEY}

      # Observability
      OTEL_EXPORTER_OTLP_ENDPOINT: http://jaeger:4318
      LOG_LEVEL: info
    ports:
      - "8080:8080"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  # ADO Workers (auto-scaled pool)
  worker:
    image: ghcr.io/dxheroes/ado-worker:latest
    command: ["node", "packages/cli/dist/worker.js"]
    environment:
      NODE_ENV: production

      # Connect to API Gateway
      ADO_API_URL: http://api:8080
      ADO_API_KEY: ${ADO_API_KEY}

      # Worker configuration
      WORKER_ID: ${HOSTNAME}
      WORKER_PROVIDER: claude-code  # or gemini-cli, cursor-cli

      # Provider credentials
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}

      # Resources
      WORKER_MAX_TASKS: 3
      WORKER_TIMEOUT: 3600
    deploy:
      replicas: 3  # Start with 3 workers, scale as needed
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '0.5'
          memory: 1G
    depends_on:
      - api

  # Dashboard (optional)
  dashboard:
    image: ghcr.io/dxheroes/ado-dashboard:latest
    environment:
      VITE_API_URL: https://ado.yourcompany.com
    ports:
      - "3000:3000"
    depends_on:
      - api

  # Jaeger (optional - for tracing)
  jaeger:
    image: jaegertracing/all-in-one:latest
    environment:
      COLLECTOR_OTLP_ENABLED: true
    ports:
      - "16686:16686"  # Jaeger UI
      - "4318:4318"    # OTLP HTTP

volumes:
  postgres-data:
  redis-data:
```

4. Set **Environment Variables** in Coolify:

```bash
# Required
POSTGRES_PASSWORD=<generate-random-password>
JWT_SECRET=<generate-random-secret>
ADO_API_KEY=<generate-api-key>

# API Keys (if using API mode)
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
OPENAI_API_KEY=sk-...

# Or subscription credentials (if using subscription mode)
ANTHROPIC_SESSION_TOKEN=...
```

5. Configure **Domain**:
   - Domain: `ado.yourcompany.com`
   - Enable **SSL/TLS** (Let's Encrypt)

6. Deploy!

#### Option B: Using Coolify CLI

```bash
# Install Coolify CLI
npm install -g coolify-cli

# Login
coolify login

# Deploy
coolify deploy \
  --project ado \
  --compose ./deploy/coolify/docker-compose.yml \
  --env ./deploy/coolify/.env.production
```

### 2. Initialize Database

After deployment, initialize the database:

```bash
# Connect to API container
coolify exec api -- npm run db:migrate

# Seed initial data (optional)
coolify exec api -- npm run db:seed
```

### 3. Configure Local CLI

On your laptop, configure the CLI to use remote workers:

```yaml
# ~/.ado/config.yaml or ./ado.config.yaml

version: "1.1"

# Remote execution
remote:
  enabled: true
  apiUrl: https://ado.yourcompany.com
  wsUrl: wss://ado.yourcompany.com

  # Authentication
  auth:
    type: api_key
    apiKey: ${ADO_API_KEY}  # Set in ~/.ado/.env

  # Default to hybrid mode (code local, execution remote)
  defaultMode: hybrid

# Provider fallback (if remote fails)
providers:
  claude-code:
    enabled: true
    accessModes:
      - mode: subscription
        priority: 1
```

Create `~/.ado/.env`:

```bash
ADO_API_KEY=your-api-key-from-coolify
```

### 4. Test Remote Execution

```bash
# Test connection
ado status --remote

# Run task in hybrid mode (code local, execution remote)
ado run "Add a hello world function to src/index.ts" --hybrid

# Run fully remote (code fetched from git)
ado run "Fix bug #123" --remote --git-ref main

# Attach to running task
ado attach <task-id>

# View logs
ado logs <task-id> --follow
```

## Hybrid Mode (Recommended)

Hybrid mode gives you the best of both worlds:

- ✅ **Code stays local** - you control your codebase
- ✅ **Execution is remote** - powerful workers
- ✅ **Live streaming** - see output in real-time
- ✅ **Git sync** - changes pushed to remote automatically

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│ 1. You run command locally                                   │
│    $ ado run "Add feature X" --hybrid                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. CLI uploads context to remote                            │
│    - Current git branch/commit                               │
│    - Modified files (optional)                               │
│    - ado.config.yaml                                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Remote worker clones your repo                           │
│    - git clone + checkout your branch                        │
│    - Apply local changes (if any)                            │
│    - Execute task in worktree                                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Stream output back to local CLI                          │
│    - Real-time progress                                      │
│    - Tool calls, file changes                                │
│    - HITL prompts                                            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Push changes back (if successful)                        │
│    - Create branch                                           │
│    - Commit changes                                          │
│    - Push to remote                                          │
└─────────────────────────────────────────────────────────────┘
```

### Configuration

```yaml
# ado.config.yaml
remote:
  hybrid:
    # Git configuration
    git:
      # Auto-push changes
      autoPush: true

      # Branch prefix for remote work
      branchPrefix: ado/

      # Commit message template
      commitTemplate: |
        {{ task.title }}

        {{ task.description }}

        🤖 Generated with ADO

    # Sync configuration
    sync:
      # Upload uncommitted changes
      uploadUncommitted: true

      # Exclude patterns
      exclude:
        - node_modules/
        - .git/
        - dist/
        - .env*

    # Execution
    execution:
      # Workspace isolation
      worktreeIsolation: true

      # Cleanup after completion
      autoCleanup: true
```

## Scaling Workers

### Manual Scaling

```bash
# Scale workers in Coolify UI
# Or via CLI:
coolify scale worker --replicas 10
```

### Auto-Scaling (K8s-style HPA)

Unfortunately, Coolify doesn't have native HPA. But you can use custom scripts:

```yaml
# deploy/coolify/autoscale.yaml
apiVersion: v1
kind: AutoScaler
spec:
  service: worker
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: queue_depth
      threshold: 10
    - type: cpu
      threshold: 70
```

```bash
# Run autoscaler as separate service
coolify deploy --service autoscaler
```

Or use a cron job:

```bash
# /etc/cron.d/ado-autoscale
*/5 * * * * /usr/local/bin/ado-autoscale.sh
```

```bash
#!/bin/bash
# ado-autoscale.sh

# Get queue depth
QUEUE_DEPTH=$(curl -s https://ado.yourcompany.com/api/metrics/queue-depth)

# Scale up if queue > 10
if [ "$QUEUE_DEPTH" -gt 10 ]; then
  CURRENT=$(coolify ps worker | grep -c "Up")
  NEW=$((CURRENT + 2))
  coolify scale worker --replicas $NEW
fi

# Scale down if queue = 0 for 5min
# (implement with Redis state)
```

## Monitoring

### Metrics

Access Prometheus metrics:

```
https://ado.yourcompany.com/metrics
```

### Jaeger Tracing

```
https://ado.yourcompany.com:16686
```

### Dashboard

```
https://ado.yourcompany.com/dashboard
```

### Logs

```bash
# View API logs
coolify logs api --follow

# View worker logs
coolify logs worker --follow

# Specific task logs
ado logs <task-id> --remote
```

## Cost Optimization

### Subscription-First Routing

Configure workers to prefer subscriptions over API:

```yaml
# Worker configuration
providers:
  claude-code:
    accessModes:
      # Try subscription first (Claude MAX)
      - mode: subscription
        priority: 1
        enabled: true
        sessionToken: ${ANTHROPIC_SESSION_TOKEN}

      # Fallback to API
      - mode: api
        priority: 2
        enabled: true
        apiKey: ${ANTHROPIC_API_KEY}
```

### Cost Limits

Set spending limits:

```yaml
# ado.config.yaml
cost:
  limits:
    # Per-task limits
    maxCostPerTask: 5.00

    # Daily limits
    maxCostPerDay: 100.00

    # Monthly limits
    maxCostPerMonth: 2000.00

  # Actions when limit exceeded
  onLimitExceeded:
    - notify:
        slack: true
        email: true
    - pause: true
```

### Team Budget Allocation

```yaml
# Team budgets
teams:
  - name: frontend
    budget:
      daily: 20.00
      monthly: 500.00

  - name: backend
    budget:
      daily: 30.00
      monthly: 800.00
```

## Security

### Authentication

ADO supports multiple auth methods:

#### API Key (Simple)

```yaml
remote:
  auth:
    type: api_key
    apiKey: ${ADO_API_KEY}
```

Generate API keys:

```bash
coolify exec api -- npm run keys:generate
# Output: ado_abc123...
```

#### JWT (Team)

```yaml
remote:
  auth:
    type: jwt
    provider: auth0  # or okta, google, github
    clientId: ${AUTH0_CLIENT_ID}
    clientSecret: ${AUTH0_CLIENT_SECRET}
```

#### OAuth (Enterprise)

```yaml
remote:
  auth:
    type: oauth
    provider: github
    scopes: [read:user, read:org]
```

### Network Security

#### Enable HTTPS

Coolify handles this automatically with Let's Encrypt.

#### Network Policies

```yaml
# docker-compose.override.yml
services:
  worker:
    networks:
      - worker-net
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    read_only: true
    tmpfs:
      - /tmp
```

### Secrets Management

Use Coolify's built-in secrets:

```bash
coolify secrets set ANTHROPIC_API_KEY sk-ant-...
coolify secrets set POSTGRES_PASSWORD ...
```

Or integrate with external vault:

```yaml
# ado.config.yaml
secrets:
  provider: vault
  vaultAddr: https://vault.yourcompany.com
  vaultToken: ${VAULT_TOKEN}
```

## Backup & Recovery

### Database Backups

Automated backups:

```yaml
# docker-compose.yml
services:
  postgres-backup:
    image: prodrigestivill/postgres-backup-local
    environment:
      POSTGRES_HOST: postgres
      POSTGRES_DB: ado
      POSTGRES_USER: ado
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      SCHEDULE: "@daily"
      BACKUP_KEEP_DAYS: 7
      BACKUP_KEEP_WEEKS: 4
      BACKUP_KEEP_MONTHS: 6
    volumes:
      - ./backups:/backups
    depends_on:
      - postgres
```

Manual backup:

```bash
coolify exec postgres -- pg_dump -U ado ado > ado-backup-$(date +%Y%m%d).sql
```

### Restore

```bash
coolify exec -i postgres -- psql -U ado ado < ado-backup-20250113.sql
```

## Troubleshooting

### Worker Not Connecting

```bash
# Check worker logs
coolify logs worker --tail 100

# Common issues:
# 1. Wrong API URL
# 2. Invalid API key
# 3. Network firewall blocking WSS
```

### Tasks Queued But Not Executing

```bash
# Check worker registry
curl https://ado.yourcompany.com/api/workers

# Should show registered workers
# If empty, workers aren't registering

# Scale up workers
coolify scale worker --replicas 5
```

### High Latency

```bash
# Check worker location
# Workers should be in same region as Coolify

# Check network:
curl -w "@curl-format.txt" https://ado.yourcompany.com/health

# Optimize:
# 1. Use CDN for dashboard
# 2. Enable compression
# 3. Use Redis for caching
```

## Comparison: Coolify vs Kubernetes

| Feature | Coolify | Kubernetes |
|---------|---------|------------|
| **Setup Time** | 15 min | 2-4 hours |
| **Complexity** | Low | High |
| **Auto-scaling** | Manual/Scripted | Native HPA |
| **HA** | Limited | Full |
| **Cost** | Lower | Higher |
| **Team Size** | 2-20 | 20+ |
| **Learning Curve** | Easy | Steep |
| **Best For** | Small teams | Enterprise |

**Recommendation:**
- **1-20 people**: Use Coolify
- **20-100 people**: Use Kubernetes
- **100+ people**: Use Kubernetes + multi-region

## Migration Path

### From Local to Coolify

1. Deploy Coolify (this guide)
2. Update local config to use remote
3. Test with `--hybrid` mode
4. Migrate team one-by-one
5. Monitor costs and scale workers

### From Coolify to Kubernetes

When you outgrow Coolify:

```bash
# Export Coolify config
coolify export --format k8s > k8s-manifests.yaml

# Deploy to K8s
kubectl apply -f k8s-manifests.yaml

# Or use Helm
helm install ado ./deploy/helm/ado
```

See [KUBERNETES.md](../deploy/KUBERNETES.md) for K8s guide.

## Next Steps

- [Remote Execution Guide](./REMOTE_EXECUTION.md) - Deep dive into remote/hybrid modes
- [Team Setup](./TEAM_SETUP.md) - Configure for team use
- [Cost Optimization](./COST_OPTIMIZATION.md) - Minimize spending
- [Kubernetes Guide](../deploy/KUBERNETES.md) - For larger teams

## Support

- Issues: https://github.com/dxheroes/ado/issues
- Coolify: https://coolify.io/docs
- Discord: https://discord.gg/ado (coming soon)

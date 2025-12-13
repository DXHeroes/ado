# ADO Coolify Deployment

Quick deployment guide for running ADO on Coolify.

## Quick Start

### 1. Prerequisites

- Coolify instance running
- Domain name (e.g., `ado.yourcompany.com`)
- Git repository access

### 2. Deploy to Coolify

#### Via Coolify UI

1. Go to your Coolify dashboard
2. Create new **Resource** → **Docker Compose**
3. Repository: `https://github.com/dxheroes/ado`
4. Path: `deploy/coolify/docker-compose.yml`
5. Build Pack: **Docker Compose**

#### Configuration

1. Copy `.env.example` to `.env`
2. Fill in required values:

```bash
# Generate secrets
openssl rand -hex 32  # For JWT_SECRET
openssl rand -hex 32  # For ADO_API_KEY
openssl rand -base64 32  # For POSTGRES_PASSWORD

# Add to Coolify environment variables
```

3. Set **Domain**: `ado.yourcompany.com`
4. Enable **SSL/TLS** (Let's Encrypt)
5. Deploy!

### 3. Verify Deployment

```bash
# Check health
curl https://ado.yourcompany.com/health

# Should return:
{
  "status": "ok",
  "version": "2.1.0",
  "workers": 3
}
```

### 4. Configure Local CLI

```yaml
# ~/.ado/config.yaml
remote:
  enabled: true
  apiUrl: https://ado.yourcompany.com
  wsUrl: wss://ado.yourcompany.com
  auth:
    type: api_key
    keyEnvVar: ADO_API_KEY
  defaultMode: hybrid
```

```bash
# ~/.ado/.env
ADO_API_KEY=ado_your_key_from_coolify
```

### 5. Test It

```bash
# Test connection
ado status --remote

# Run task in hybrid mode
ado run "Add a hello world function" --hybrid
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Coolify Server                            │
│                                                              │
│  ┌────────────┐   ┌──────────┐   ┌────────┐                │
│  │ Traefik    │──►│   API    │──►│ Redis  │                │
│  │ (Reverse   │   │ Gateway  │   │        │                │
│  │  Proxy)    │   └────┬─────┘   └────────┘                │
│  └────────────┘        │                                    │
│      SSL/TLS           │         ┌──────────┐               │
│      Let's Encrypt     ├────────►│PostgreSQL│               │
│                        │         └──────────┘               │
│                        │                                    │
│                        ▼                                    │
│             ┌──────────────────────┐                        │
│             │   Worker Pool        │                        │
│             │  ┌────┐  ┌────┐      │                        │
│             │  │ W1 │  │ W2 │ ...  │                        │
│             │  └────┘  └────┘      │                        │
│             └──────────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │
                          │ HTTPS/WSS
                          │
                   ┌──────┴──────┐
                   │  Your Laptop │
                   │  (Local CLI) │
                   └─────────────┘
```

## Profiles

The docker-compose.yml supports multiple profiles:

```bash
# Minimal (API + Workers only)
docker compose up -d

# With Dashboard
docker compose --profile dashboard up -d

# With Observability (Jaeger)
docker compose --profile observability up -d

# With Backup
docker compose --profile backup up -d

# Full stack
docker compose --profile full --profile dashboard --profile observability --profile backup up -d
```

## Scaling

### Manual Scaling

In Coolify UI:
1. Go to your service
2. Click **Scale**
3. Set replicas for workers

Or via environment:

```bash
# .env
WORKER_CLAUDE_REPLICAS=5
WORKER_GEMINI_REPLICAS=2
```

### Auto-Scaling (via script)

Create a cron job:

```bash
# /etc/cron.d/ado-autoscale
*/5 * * * * /usr/local/bin/ado-autoscale.sh
```

```bash
#!/bin/bash
# ado-autoscale.sh

QUEUE=$(curl -s https://ado.yourcompany.com/api/metrics/queue-depth | jq -r '.depth')

if [ "$QUEUE" -gt 10 ]; then
  # Scale up
  coolify scale worker-claude --replicas 10
elif [ "$QUEUE" -eq 0 ]; then
  # Scale down
  coolify scale worker-claude --replicas 2
fi
```

## Monitoring

### Dashboard

Access at: `https://ado.yourcompany.com/dashboard`

### Metrics

Prometheus metrics at: `https://ado.yourcompany.com/metrics`

### Logs

```bash
# API logs
coolify logs api --follow

# Worker logs
coolify logs worker-claude --follow

# All logs
coolify logs --follow
```

### Tracing (if enabled)

Jaeger UI at: `https://ado.yourcompany.com:16686`

## Backup & Restore

### Automated Backups

If using the backup profile:

```bash
docker compose --profile backup up -d
```

Backups stored in: `./backups/`

### Manual Backup

```bash
# Database
docker compose exec postgres pg_dump -U ado ado > backup.sql

# Redis (if needed)
docker compose exec redis redis-cli BGSAVE
```

### Restore

```bash
# Database
docker compose exec -i postgres psql -U ado ado < backup.sql
```

## Troubleshooting

### Workers not connecting

```bash
# Check API logs
coolify logs api

# Check worker logs
coolify logs worker-claude

# Verify API key
curl -H "Authorization: Bearer $ADO_API_KEY" https://ado.yourcompany.com/api/workers
```

### Database connection issues

```bash
# Check PostgreSQL
docker compose exec postgres pg_isready -U ado

# Check connection from API
docker compose exec api node -e "require('packages/core/dist/state/postgresql').testConnection()"
```

### High memory usage

```bash
# Check container stats
docker stats

# Reduce worker tasks
# .env
WORKER_MAX_TASKS=1
```

## Security

### Secrets Management

Never commit `.env` to git!

Use Coolify's built-in secrets:
1. Go to your service
2. Click **Environment**
3. Add secrets there

### Firewall

Ensure these ports are open:
- `80` - HTTP (redirects to HTTPS)
- `443` - HTTPS/WSS
- `16686` - Jaeger UI (optional)

### SSH Keys for Private Repos

```bash
# Generate SSH key
ssh-keygen -t ed25519 -f ./ssh/id_ed25519 -N ""

# Add public key to GitHub/GitLab
cat ./ssh/id_ed25519.pub

# Mount in docker-compose.yml
# volumes:
#   - ./ssh:/root/.ssh:ro
```

## Cost Optimization

### Use Subscriptions

Prefer subscription mode over API:

```bash
# .env
WORKER_MODE=subscription
ANTHROPIC_SESSION_TOKEN=sk-ant-sid...
```

### Auto-scale Down

Scale to 0 replicas during off-hours:

```bash
# At night
0 22 * * * coolify scale worker-claude --replicas 0

# In morning
0 8 * * 1-5 coolify scale worker-claude --replicas 3
```

### Monitor Costs

```bash
# Daily cost report
ado cost report --period day

# Set alerts
# ado.config.yaml
cost:
  alerts:
    slack:
      webhook: https://hooks.slack.com/...
      threshold: 80
```

## Migration

### From Local to Coolify

1. Deploy Coolify (this guide)
2. Test with single task: `ado run "test" --hybrid`
3. Update team config to use remote
4. Monitor and scale as needed

### From Coolify to Kubernetes

When you need more:

```bash
# Export config
coolify export > k8s.yaml

# Deploy to K8s
helm install ado ./deploy/helm/ado
```

See [../KUBERNETES.md](../KUBERNETES.md)

## Updates

### Update ADO

```bash
# In Coolify UI: Redeploy with latest image

# Or manually
docker compose pull
docker compose up -d
```

### Database Migrations

```bash
# Run migrations
docker compose exec api npm run db:migrate
```

## Support

- Documentation: [../../docs/](../../docs/)
- Issues: https://github.com/dxheroes/ado/issues
- Coolify: https://coolify.io/docs

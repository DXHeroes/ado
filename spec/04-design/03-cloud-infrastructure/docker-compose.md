# Docker Compose Design

## Přehled

Architektonický design pro Docker Compose deployment ADO - od lokálního vývoje po produkční nasazení na single-node infrastruktuře.

## Deployment Scenarios

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Docker Compose Deployment Scenarios                      │
└─────────────────────────────────────────────────────────────────────────────┘

1. DEVELOPMENT (docker-compose.dev.yaml)
   ┌─────────────────────────────────────────────────────┐
   │  Single machine, hot reload, debug ports           │
   │                                                     │
   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
   │  │   API   │ │Orchestr.│ │ Worker  │ │Dashboard│  │
   │  │ (dev)   │ │ (dev)   │ │ (1x)    │ │ (dev)   │  │
   │  └─────────┘ └─────────┘ └─────────┘ └─────────┘  │
   │       │           │           │           │        │
   │  ┌────┴───────────┴───────────┴───────────┴────┐  │
   │  │              Shared Network                  │  │
   │  └────┬───────────────────────────────────┬────┘  │
   │       │                                   │        │
   │  ┌─────────┐                        ┌─────────┐   │
   │  │PostgreSQL│                        │  Redis  │   │
   │  │  (dev)  │                        │  (dev)  │   │
   │  └─────────┘                        └─────────┘   │
   └─────────────────────────────────────────────────────┘

2. STAGING (docker-compose.staging.yaml)
   ┌─────────────────────────────────────────────────────┐
   │  Production-like, limited resources                 │
   │                                                     │
   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
   │  │   API   │ │Orchestr.│ │ Workers │ │Dashboard│  │
   │  │ (2x)    │ │ (1x)    │ │ (3x)    │ │ (1x)    │  │
   │  └─────────┘ └─────────┘ └─────────┘ └─────────┘  │
   └─────────────────────────────────────────────────────┘

3. PRODUCTION (docker-compose.prod.yaml)
   ┌─────────────────────────────────────────────────────┐
   │  Full resources, HA where possible                  │
   │                                                     │
   │  ┌─────────┐  ┌─────────┐  ┌─────────────────────┐ │
   │  │  Nginx  │  │   API   │  │      Workers        │ │
   │  │ (proxy) │─►│ (2-3x)  │  │     (5-10x)         │ │
   │  └─────────┘  └─────────┘  └─────────────────────┘ │
   │       │            │                │              │
   │  ┌────┴────────────┴────────────────┴────────┐    │
   │  │           Production Network              │    │
   │  └────┬─────────────────────────────────┬────┘    │
   │       │                                 │         │
   │  ┌─────────┐                      ┌─────────┐    │
   │  │PostgreSQL│                      │  Redis  │    │
   │  │(managed) │                      │(managed)│    │
   │  └─────────┘                      └─────────┘    │
   └─────────────────────────────────────────────────────┘
```

## Service Architecture

### Core Services

```yaml
# Definice služeb a jejich závislostí
services:
  api-gateway:
    role: Entry point pro API requesty
    dependencies: [postgres, redis]
    scaling: 1-3 repliky
    ports: [3000, 3001]

  orchestrator:
    role: Koordinace úkolů a workerů
    dependencies: [postgres, redis]
    scaling: 1 (singleton)
    internal: true

  worker:
    role: Provádění AI agentů
    dependencies: [orchestrator, postgres, redis]
    scaling: 1-N repliky
    resources: CPU/RAM intensive

  dashboard:
    role: Web UI
    dependencies: [api-gateway]
    scaling: 1
    ports: [8080]
```

### Supporting Services

```yaml
services:
  postgres:
    role: Primární databáze
    persistence: volume
    backup: required

  redis:
    role: Cache, pub/sub, queues
    persistence: optional
    mode: standalone nebo sentinel

  prometheus:
    role: Metrics collection
    optional: true

  grafana:
    role: Dashboards
    optional: true
```

## Network Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Network Architecture                               │
└─────────────────────────────────────────────────────────────────────────────┘

                            ┌─────────────┐
                            │   Internet  │
                            └──────┬──────┘
                                   │
                              port 80/443
                                   │
                            ┌──────▼──────┐
                            │    Nginx    │
                            │   (proxy)   │
                            └──────┬──────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
              ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐
              │ Dashboard │ │    API    │ │    WS     │
              │   :8080   │ │   :3000   │ │   :3001   │
              └───────────┘ └───────────┘ └───────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        ado-frontend (network)                                │
│                                                                              │
│    Nginx ◄──────────────────► Dashboard                                     │
│      │                                                                       │
│      └──────────────────────► API Gateway                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        ado-backend (network)                                 │
│                                                                              │
│    API Gateway ◄────────────► Orchestrator ◄────────────► Workers          │
│         │                          │                          │             │
│         │                          │                          │             │
│         └──────────┬───────────────┴──────────────────────────┘             │
│                    │                                                         │
│              ┌─────▼─────┐                    ┌───────────┐                 │
│              │ PostgreSQL│                    │   Redis   │                 │
│              └───────────┘                    └───────────┘                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Resource Management

### Resource Allocation Strategy

```typescript
// Resource allocation based on tier
interface TierResources {
  development: {
    api: { cpu: '0.5', memory: '512Mi' };
    orchestrator: { cpu: '0.5', memory: '512Mi' };
    worker: { cpu: '1', memory: '2Gi', replicas: 1 };
    postgres: { cpu: '0.5', memory: '512Mi' };
    redis: { cpu: '0.25', memory: '256Mi' };
  };

  staging: {
    api: { cpu: '1', memory: '1Gi', replicas: 2 };
    orchestrator: { cpu: '1', memory: '1Gi' };
    worker: { cpu: '2', memory: '4Gi', replicas: 3 };
    postgres: { cpu: '1', memory: '2Gi' };
    redis: { cpu: '0.5', memory: '512Mi' };
  };

  production: {
    api: { cpu: '2', memory: '2Gi', replicas: 3 };
    orchestrator: { cpu: '2', memory: '2Gi' };
    worker: { cpu: '4', memory: '8Gi', replicas: 5 };
    postgres: { cpu: '4', memory: '8Gi' };
    redis: { cpu: '1', memory: '2Gi' };
  };
}
```

### Docker Compose Resource Limits

```yaml
# docker-compose.prod.yaml
services:
  api-gateway:
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3

  worker:
    deploy:
      replicas: 5
      resources:
        limits:
          cpus: '4'
          memory: 8G
        reservations:
          cpus: '1'
          memory: 2G
      update_config:
        parallelism: 1
        delay: 10s
```

## Health Checks

```yaml
services:
  api-gateway:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  orchestrator:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9090/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  worker:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9091/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  postgres:
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ado"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
```

## Volume Strategy

```yaml
volumes:
  # PostgreSQL data
  postgres_data:
    driver: local
    driver_opts:
      type: none
      device: /data/ado/postgres
      o: bind

  # Redis data (optional persistence)
  redis_data:
    driver: local

  # Workspaces for tasks
  workspaces:
    driver: local
    driver_opts:
      type: none
      device: /data/ado/workspaces
      o: bind

  # Logs
  logs:
    driver: local
    driver_opts:
      type: none
      device: /var/log/ado
      o: bind
```

## Environment Configuration

```typescript
// Environment configuration strategy
interface EnvironmentConfig {
  // Base configuration (always applied)
  base: {
    NODE_ENV: string;
    LOG_FORMAT: 'json';
  };

  // Development overrides
  development: {
    LOG_LEVEL: 'debug';
    CORS_ORIGINS: '*';
    DB_LOGGING: true;
  };

  // Production overrides
  production: {
    LOG_LEVEL: 'info';
    CORS_ORIGINS: '${ALLOWED_ORIGINS}';
    DB_LOGGING: false;
    DB_SSL: true;
  };
}
```

### Environment Files

```bash
# .env.example
# =============================================================================
# ADO Docker Compose Configuration
# =============================================================================

# Deployment
ADO_VERSION=2.0.0
COMPOSE_PROJECT_NAME=ado

# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=ado
DB_USER=ado
DB_PASSWORD=change-me-in-production

# Redis
REDIS_URL=redis://redis:6379

# Security
JWT_SECRET=change-me-min-32-characters

# AI Providers (at least one required)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_AI_API_KEY=

# Scaling
WORKER_REPLICAS=3

# Domain (production)
DOMAIN=ado.example.com
```

## Startup Order

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Service Startup Order                               │
└─────────────────────────────────────────────────────────────────────────────┘

Phase 1: Infrastructure
┌─────────────┐     ┌─────────────┐
│  PostgreSQL │     │    Redis    │
│             │     │             │
│  Wait for   │     │  Wait for   │
│  healthy    │     │  healthy    │
└──────┬──────┘     └──────┬──────┘
       │                   │
       └─────────┬─────────┘
                 │
                 ▼
Phase 2: Core Services
         ┌─────────────┐
         │ Orchestrator│
         │             │
         │  Run DB     │
         │  migrations │
         └──────┬──────┘
                │
                ▼
Phase 3: API Layer
         ┌─────────────┐
         │ API Gateway │
         │             │
         │  Wait for   │
         │ orchestrator│
         └──────┬──────┘
                │
                ▼
Phase 4: Workers
    ┌───────────────────────┐
    │       Workers         │
    │                       │
    │  Register with        │
    │  orchestrator         │
    └───────────┬───────────┘
                │
                ▼
Phase 5: Frontend
         ┌─────────────┐
         │  Dashboard  │
         │             │
         │  Connect to │
         │  API        │
         └─────────────┘
```

## Scaling Considerations

### Horizontal Scaling

```bash
# Scale workers
docker compose up -d --scale worker=10

# Scale API (with load balancer)
docker compose up -d --scale api-gateway=3
```

### Limitations

| Component | Max Replicas | Reason |
|-----------|--------------|--------|
| Orchestrator | 1 | Singleton pattern, uses leader election |
| API Gateway | 3-5 | Limited by connection pooling |
| Workers | 20+ | Limited by host resources |
| PostgreSQL | 1 | Single-node deployment |
| Redis | 1 | Single-node deployment |

### When to Move to Kubernetes

- More than 20 workers needed
- Multi-node deployment required
- Auto-scaling based on metrics
- Zero-downtime deployments
- Service mesh requirements

## Backup Strategy

```yaml
# backup-compose.yaml
services:
  postgres-backup:
    image: postgres:16-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data:ro
      - ./backups:/backups
    command: |
      sh -c 'pg_dump -U ado ado > /backups/ado-$$(date +%Y%m%d-%H%M%S).sql'
    profiles:
      - backup

  redis-backup:
    image: redis:7-alpine
    volumes:
      - redis_data:/data:ro
      - ./backups:/backups
    command: |
      sh -c 'cp /data/dump.rdb /backups/redis-$$(date +%Y%m%d-%H%M%S).rdb'
    profiles:
      - backup
```

```bash
# Run backup
docker compose --profile backup run --rm postgres-backup
docker compose --profile backup run --rm redis-backup
```

## Monitoring Stack

```yaml
# docker-compose.monitoring.yaml
services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=15d'
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:latest
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards
      - ./grafana/datasources:/etc/grafana/provisioning/datasources
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-admin}
    ports:
      - "3030:3000"

volumes:
  prometheus_data:
  grafana_data:
```

---

## Souvislosti

- [Operations: Docker Compose](../../07-operations/01-deployment/docker-compose.md)
- [Kubernetes Deployment](./kubernetes-deployment.md)
- [Coolify Integration](./coolify-integration.md)
- [NFR-002: Scalability](../../02-requirements/02-non-functional/NFR-002-scalability.md)

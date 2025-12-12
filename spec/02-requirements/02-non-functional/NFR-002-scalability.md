# NFR-002: Scalability

## Přehled

ADO musí škálovat od single-user lokálního provozu po enterprise multi-tenant nasazení s desítkami současných uživatelů a stovkami workerů.

## Požadavky

### NFR-002.1: Horizontal Scaling

**Workers:**
| Tier | Min | Max | Auto-scale trigger |
|------|-----|-----|-------------------|
| Dev | 1 | 5 | Queue > 5 |
| Team | 3 | 20 | Queue > 10, CPU > 70% |
| Enterprise | 10 | 100 | Queue > 50, CPU > 60% |

**Acceptance criteria:**
- [ ] Scale up time < 2 minutes
- [ ] Scale down time < 5 minutes (graceful)
- [ ] Zero-downtime scaling
- [ ] Pod disruption budget respected

### NFR-002.2: Vertical Scaling

**Worker resource tiers:**
| Tier | CPU | Memory | Use case |
|------|-----|--------|----------|
| Small | 1 | 2GB | Simple tasks |
| Medium | 2 | 4GB | Standard tasks |
| Large | 4 | 8GB | Complex tasks |
| XLarge | 8 | 16GB | Large codebases |

### NFR-002.3: Data Scaling

| Objem | Storage | Query performance |
|-------|---------|-------------------|
| 10K tasks | < 1GB | < 50ms |
| 100K tasks | < 10GB | < 100ms |
| 1M tasks | < 100GB | < 200ms |

**Data retention:**
```yaml
retention:
  tasks: 90d
  logs: 30d
  checkpoints: 7d
  metrics: 365d
```

### NFR-002.4: Concurrent Users

| Tier | Users | Tasks/user/day |
|------|-------|----------------|
| Dev | 1-5 | 50 |
| Team | 5-50 | 100 |
| Enterprise | 50-500 | 200 |

### NFR-002.5: Geographic Distribution

**Acceptance criteria:**
- [ ] Multi-region deployment support
- [ ] Regional data residency
- [ ] Cross-region latency < 200ms
- [ ] Failover between regions

---

## Scaling Architecture

```
                    Load Balancer
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │Controller│   │Controller│   │Controller│
    │ Node 1   │   │ Node 2   │   │ Node N   │
    └────┬─────┘   └────┬─────┘   └────┬─────┘
         │              │              │
         └──────────────┼──────────────┘
                        │
              ┌─────────┴─────────┐
              │                   │
              ▼                   ▼
        ┌──────────┐        ┌──────────┐
        │PostgreSQL│        │  Redis   │
        │ (Primary)│        │ Cluster  │
        └────┬─────┘        └──────────┘
             │
             ▼
        ┌──────────┐
        │PostgreSQL│
        │(Replica) │
        └──────────┘
```

---

## Auto-scaling Configuration

```yaml
autoscaling:
  enabled: true

  workers:
    minReplicas: 3
    maxReplicas: 50
    metrics:
      - type: "queue_length"
        target: 10
        scaleUp: 2  # Add 2 workers when triggered
        scaleDown: 1
      - type: "cpu"
        target: 70
        scaleUp: 1
        scaleDown: 1

    cooldown:
      scaleUp: 60s
      scaleDown: 300s

  controllers:
    minReplicas: 2
    maxReplicas: 5
    metrics:
      - type: "cpu"
        target: 60
```

---

## Limits and Quotas

```yaml
limits:
  # Per user
  user:
    maxConcurrentTasks: 10
    maxQueuedTasks: 50
    maxDailyTasks: 500

  # Per organization
  org:
    maxConcurrentTasks: 100
    maxWorkers: 50
    maxDailyCost: 1000

  # System-wide
  system:
    maxTotalWorkers: 1000
    maxTotalTasks: 10000
```

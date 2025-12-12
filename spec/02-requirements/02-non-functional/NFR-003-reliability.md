# NFR-003: Reliability

## Přehled

ADO musí poskytovat vysokou dostupnost a spolehlivost, s minimální ztrátou dat a rychlým obnovením po výpadcích.

## Požadavky

### NFR-003.1: Availability

| Tier | SLA | Downtime/month |
|------|-----|----------------|
| Dev | 99% | 7.3 hours |
| Team | 99.5% | 3.6 hours |
| Enterprise | 99.9% | 43 minutes |

### NFR-003.2: Data Durability

| Data type | Durability | Backup frequency |
|-----------|------------|------------------|
| Task state | 99.99% | Continuous (WAL) |
| Checkpoints | 99.99% | Every 30s |
| Logs | 99.9% | Hourly |
| Config | 99.99% | On change |

### NFR-003.3: Recovery Time

| Failure type | Detection | Recovery |
|--------------|-----------|----------|
| Worker crash | < 30s | < 2min |
| Controller failover | < 10s | < 30s |
| Database failover | < 30s | < 1min |
| Full cluster recovery | - | < 15min |

### NFR-003.4: Fault Tolerance

**Single points of failure:** NONE

**Redundancy requirements:**
- [ ] Minimum 2 controller replicas
- [ ] Database with replica
- [ ] Redis in cluster mode
- [ ] Multi-AZ deployment

### NFR-003.5: Graceful Degradation

| Component failure | Impact | Mitigation |
|-------------------|--------|------------|
| 1 worker | None | Other workers handle load |
| All workers | Tasks queued | Auto-scale new workers |
| 1 controller | None | Other controllers handle |
| Database replica | Read perf down | Failover to primary |
| Redis | Rate limits disabled | In-memory fallback |

---

## Failure Scenarios

### Worker Failure
```
Worker crashes
      │
      ▼
Heartbeat timeout (30s)
      │
      ▼
Controller detects
      │
      ▼
Task reassigned to healthy worker
      │
      ▼
Resume from checkpoint
```

### Controller Failure
```
Controller crashes
      │
      ▼
Load balancer health check fails
      │
      ▼
Traffic routed to healthy controllers
      │
      ▼
Workers reconnect automatically
```

### Database Failure
```
Primary database fails
      │
      ▼
Connection errors detected
      │
      ▼
Automatic failover to replica
      │
      ▼
Replica promoted to primary
      │
      ▼
Applications reconnect
```

---

## Checkpointing Strategy

```yaml
checkpoint:
  interval: 30s
  maxSize: 10MB

  triggers:
    - interval: 30s
    - onSubtaskComplete: true
    - onHitlCheckpoint: true
    - beforeRiskyOperation: true

  storage:
    type: "s3"  # or "database"
    retention: 7d
    compression: true
```

---

## Health Checks

```yaml
healthChecks:
  controller:
    liveness:
      path: "/health/live"
      interval: 10s
      timeout: 5s
      failureThreshold: 3

    readiness:
      path: "/health/ready"
      interval: 5s
      timeout: 3s
      failureThreshold: 2

  worker:
    heartbeat:
      interval: 30s
      timeout: 60s
      failureThreshold: 2
```

---

## Disaster Recovery

| RPO | RTO | Strategy |
|-----|-----|----------|
| 1 minute | 15 minutes | Automated failover |
| 1 hour | 4 hours | Manual intervention |
| 24 hours | 24 hours | Backup restore |

**Backup strategy:**
```yaml
backup:
  database:
    type: "continuous"
    retention: 30d
    location: "s3://backups/db/"

  checkpoints:
    type: "continuous"
    retention: 7d

  config:
    type: "on-change"
    retention: 90d
```

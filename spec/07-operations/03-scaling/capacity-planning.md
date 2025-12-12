# Capacity Planning

## Přehled

Průvodce plánováním kapacity pro ADO deployment - od malých týmů po enterprise nasazení.

## Sizing Guide

### Deployment Tiers

| Tier | Users | Tasks/Day | Workers | RAM | CPU |
|------|-------|-----------|---------|-----|-----|
| Small | 1-5 | <50 | 1-2 | 8GB | 4 |
| Medium | 5-20 | 50-200 | 3-5 | 16GB | 8 |
| Large | 20-100 | 200-1000 | 5-15 | 32GB | 16 |
| Enterprise | 100+ | 1000+ | 15+ | 64GB+ | 32+ |

### Component Requirements

#### API Gateway

```yaml
# Small
resources:
  requests:
    cpu: 250m
    memory: 256Mi
  limits:
    cpu: 1000m
    memory: 1Gi
replicas: 1

# Medium
resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 2000m
    memory: 2Gi
replicas: 2

# Large/Enterprise
resources:
  requests:
    cpu: 1000m
    memory: 1Gi
  limits:
    cpu: 4000m
    memory: 4Gi
replicas: 3-5
```

#### Orchestrator

```yaml
# Small
resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 2000m
    memory: 2Gi
replicas: 1

# Medium
resources:
  requests:
    cpu: 1000m
    memory: 1Gi
  limits:
    cpu: 4000m
    memory: 4Gi
replicas: 2

# Large/Enterprise
resources:
  requests:
    cpu: 2000m
    memory: 2Gi
  limits:
    cpu: 8000m
    memory: 8Gi
replicas: 2-3
```

#### Workers

```yaml
# Per worker
resources:
  requests:
    cpu: 1000m
    memory: 2Gi
  limits:
    cpu: 4000m
    memory: 8Gi

# Scaling
small: 1-2 workers
medium: 3-5 workers
large: 5-15 workers
enterprise: 15-50+ workers
```

#### PostgreSQL

| Tier | CPU | RAM | Storage | Connections |
|------|-----|-----|---------|-------------|
| Small | 1 | 2GB | 20GB | 50 |
| Medium | 2 | 4GB | 50GB | 100 |
| Large | 4 | 8GB | 100GB | 200 |
| Enterprise | 8+ | 16GB+ | 500GB+ | 500+ |

#### Redis

| Tier | RAM | Storage |
|------|-----|---------|
| Small | 512MB | 1GB |
| Medium | 1GB | 5GB |
| Large | 2GB | 10GB |
| Enterprise | 4GB+ | 20GB+ |

## Workload Analysis

### Task Characteristics

```typescript
interface TaskProfile {
  // Průměrná doba trvání
  avgDuration: {
    simple: 5 * 60,      // 5 min
    moderate: 15 * 60,   // 15 min
    complex: 45 * 60,    // 45 min
    greenfield: 60 * 60, // 60 min
  };

  // Průměrná spotřeba tokenů
  avgTokens: {
    simple: 10_000,
    moderate: 50_000,
    complex: 150_000,
    greenfield: 300_000,
  };

  // Průměrné náklady (API mode)
  avgCost: {
    simple: 0.10,
    moderate: 0.50,
    complex: 1.50,
    greenfield: 3.00,
  };
}
```

### Capacity Formulas

```typescript
// Počet workerů pro daný throughput
function calculateWorkers(tasksPerHour: number, avgTaskDuration: number): number {
  const tasksPerWorkerPerHour = 60 / (avgTaskDuration / 60);
  return Math.ceil(tasksPerHour / tasksPerWorkerPerHour);
}

// Příklad:
// 20 tasks/hour, avg 15 min duration
// Workers needed = 20 / 4 = 5 workers

// Database connections
function calculateDbConnections(workers: number, apiGatewayReplicas: number): number {
  const connectionsPerWorker = 5;
  const connectionsPerApiGateway = 10;
  const overhead = 20; // Orchestrator, migrations, etc.

  return (workers * connectionsPerWorker) +
         (apiGatewayReplicas * connectionsPerApiGateway) +
         overhead;
}
```

## Scaling Strategies

### Horizontal Scaling

#### Workers

```yaml
# Kubernetes HPA
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ado-worker-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ado-worker
  minReplicas: 3
  maxReplicas: 20
  metrics:
    # Scale based on queue length
    - type: External
      external:
        metric:
          name: ado_task_queue_length
        target:
          type: AverageValue
          averageValue: "5"

    # Scale based on CPU
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

#### API Gateway

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ado-api-gateway-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ado-api-gateway
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

### Vertical Scaling

```yaml
# Vertical Pod Autoscaler
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: ado-worker-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ado-worker
  updatePolicy:
    updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
      - containerName: worker
        minAllowed:
          cpu: 500m
          memory: 1Gi
        maxAllowed:
          cpu: 8
          memory: 16Gi
```

## Cost Estimation

### Infrastructure Costs

| Component | Small | Medium | Large | Enterprise |
|-----------|-------|--------|-------|------------|
| Compute | $50/mo | $200/mo | $800/mo | $3000+/mo |
| Database | $20/mo | $50/mo | $200/mo | $500+/mo |
| Storage | $10/mo | $30/mo | $100/mo | $300+/mo |
| Network | $10/mo | $30/mo | $100/mo | $300+/mo |
| **Total** | **$90/mo** | **$310/mo** | **$1200/mo** | **$4100+/mo** |

### AI Provider Costs

| Mode | Cost Model | Monthly Est. (Medium) |
|------|------------|----------------------|
| Subscription | Fixed | $20-40/user |
| API | Pay-per-use | $0.50-3/task |
| Hybrid | Subscription + overflow | Varies |

### Cost Optimization

```yaml
# Prioritize subscription
providers:
  claude-code:
    accessModes:
      - mode: subscription
        priority: 1
      - mode: api
        priority: 10
        enabled: false  # Disable by default

# Set cost limits
limits:
  maxDailyCost: 100
  maxTaskCost: 5
  alertOnCost: 80  # Alert at 80% of daily limit
```

## Performance Benchmarks

### Expected Performance

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| API Latency (p95) | <200ms | >500ms | >1s |
| Task Queue Time | <30s | >2min | >5min |
| Worker Utilization | 60-80% | >90% | >95% |
| Success Rate | >95% | <90% | <80% |

### Load Testing

```bash
# k6 load test
k6 run - << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 10 },  // Ramp up
    { duration: '5m', target: 10 },  // Steady
    { duration: '2m', target: 50 },  // Spike
    { duration: '5m', target: 50 },  // Steady at spike
    { duration: '2m', target: 0 },   // Ramp down
  ],
};

export default function () {
  const res = http.post('http://api.ado.local/tasks', JSON.stringify({
    prompt: 'Add health check endpoint',
    taskType: 'feature',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'status is 201': (r) => r.status === 201,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
EOF
```

## Growth Planning

### Monitoring Growth

```prometheus
# Track usage trends
increase(ado_tasks_total[30d])

# Users growth
ado_active_users_total

# Resource utilization trend
avg_over_time(ado_worker_utilization_percent[7d])
```

### Scaling Triggers

| Metric | Trigger | Action |
|--------|---------|--------|
| Queue length > 50 | 5 min | Scale workers +2 |
| CPU > 80% | 5 min | Scale component |
| Memory > 85% | 5 min | Scale component |
| Tasks/day +50% | 7 days | Review capacity |

### Capacity Review Checklist

```markdown
## Monthly Capacity Review

- [ ] Current usage vs. capacity
- [ ] Growth trend (30 day)
- [ ] Performance metrics in target?
- [ ] Cost vs. budget
- [ ] Upcoming projects/needs
- [ ] Provider rate limit headroom
- [ ] Database performance
- [ ] Storage utilization

## Actions
- [ ] Scale needed? (Y/N)
- [ ] Optimization opportunities
- [ ] Budget adjustment needed?
```

## Disaster Recovery

### Backup Requirements

| Component | RPO | RTO | Strategy |
|-----------|-----|-----|----------|
| PostgreSQL | 1h | 4h | Continuous WAL + daily snapshot |
| Redis | 4h | 1h | RDB snapshots |
| Workspaces | 24h | 8h | Daily backup |
| Config | 0 | 15min | Git versioned |

### Capacity for DR

```yaml
# DR site sizing (minimum)
dr_capacity:
  workers: 50%  # of primary
  database: 100%  # full replica
  storage: 100%  # full sync

# Failover time
failover_target: 30min
```

---

## Souvislosti

- [Kubernetes Deployment](../01-deployment/kubernetes.md)
- [Metrics](../02-monitoring/metrics.md)
- [Alerting](../02-monitoring/alerting.md)
- [NFR-002: Scalability](../../02-requirements/02-non-functional/NFR-002-scalability.md)

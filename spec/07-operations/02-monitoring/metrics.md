# Metrics & Monitoring

## Přehled

Kompletní průvodce monitorováním ADO pomocí metrik, logů a tracingu.

## Architektura monitoringu

```
┌─────────────────────────────────────────────────────────────────┐
│                     ADO Components                               │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │   API    │  │Orchestr. │  │  Worker  │  │Dashboard │        │
│  │ Gateway  │  │          │  │          │  │          │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       │             │             │             │               │
│       └─────────────┴──────┬──────┴─────────────┘               │
│                            │                                     │
│                     /metrics endpoint                            │
└────────────────────────────┼────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Prometheus                                    │
│                    :9090                                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Grafana                                      │
│                     :3000                                        │
│                                                                  │
│   ┌────────────┐  ┌────────────┐  ┌────────────┐               │
│   │  Overview  │  │   Tasks    │  │  Workers   │               │
│   │ Dashboard  │  │ Dashboard  │  │ Dashboard  │               │
│   └────────────┘  └────────────┘  └────────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

## Klíčové metriky

### Task Metrics

```prometheus
# Celkový počet úkolů
ado_tasks_total{status="completed|failed|cancelled"} counter

# Doba trvání úkolů
ado_tasks_duration_seconds{task_type, provider} histogram

# Aktuálně běžící úkoly
ado_tasks_active{status="running|paused|validating"} gauge

# Délka fronty
ado_task_queue_length gauge

# Retry count
ado_tasks_retries_total{task_type} counter
```

### Provider Metrics

```prometheus
# Počet požadavků na providera
ado_provider_requests_total{provider, access_mode, status} counter

# Latence providera
ado_provider_latency_seconds{provider} histogram

# Rate limit events
ado_provider_rate_limits_total{provider} counter

# Fallback events
ado_provider_fallbacks_total{from_provider, to_provider} counter

# Token usage
ado_provider_tokens_total{provider, direction="input|output"} counter
```

### Cost Metrics

```prometheus
# Celkové náklady
ado_cost_usd_total{provider, access_mode} counter

# Náklady za úkol
ado_task_cost_usd{task_type, provider} histogram

# Daily cost
ado_cost_daily_usd gauge
```

### Worker Metrics

```prometheus
# Počet workerů
ado_workers_total{status="idle|busy|offline"} gauge

# Využití workerů
ado_worker_utilization_percent gauge

# Úkoly na workera
ado_worker_tasks_total{worker_id, status} counter

# Worker health
ado_worker_health{worker_id} gauge  # 1 = healthy, 0 = unhealthy
```

### System Metrics

```prometheus
# API latence
ado_http_request_duration_seconds{method, path, status} histogram

# WebSocket connections
ado_websocket_connections_total gauge

# Database connections
ado_db_connections_total{state="active|idle"} gauge

# Redis connections
ado_redis_connections_total gauge
```

## Prometheus konfigurace

### prometheus.yml

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

rule_files:
  - /etc/prometheus/rules/*.yml

scrape_configs:
  # ADO API Gateway
  - job_name: 'ado-api-gateway'
    static_configs:
      - targets: ['api-gateway:9090']
    metrics_path: /metrics

  # ADO Orchestrator
  - job_name: 'ado-orchestrator'
    static_configs:
      - targets: ['orchestrator:9090']

  # ADO Workers
  - job_name: 'ado-workers'
    kubernetes_sd_configs:
      - role: pod
        namespaces:
          names: ['ado-system']
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_label_app]
        regex: ado-worker
        action: keep

  # PostgreSQL
  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']

  # Redis
  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']
```

## Grafana Dashboards

### Overview Dashboard

```json
{
  "title": "ADO Overview",
  "panels": [
    {
      "title": "Tasks per Hour",
      "type": "graph",
      "targets": [
        {
          "expr": "sum(increase(ado_tasks_total[1h])) by (status)"
        }
      ]
    },
    {
      "title": "Active Tasks",
      "type": "stat",
      "targets": [
        {
          "expr": "sum(ado_tasks_active)"
        }
      ]
    },
    {
      "title": "Success Rate",
      "type": "gauge",
      "targets": [
        {
          "expr": "sum(rate(ado_tasks_total{status='completed'}[1h])) / sum(rate(ado_tasks_total[1h])) * 100"
        }
      ]
    },
    {
      "title": "Average Duration",
      "type": "stat",
      "targets": [
        {
          "expr": "avg(ado_tasks_duration_seconds)"
        }
      ]
    },
    {
      "title": "Daily Cost",
      "type": "stat",
      "targets": [
        {
          "expr": "sum(increase(ado_cost_usd_total[24h]))"
        }
      ]
    },
    {
      "title": "Worker Utilization",
      "type": "gauge",
      "targets": [
        {
          "expr": "avg(ado_worker_utilization_percent)"
        }
      ]
    }
  ]
}
```

### Tasks Dashboard

```json
{
  "title": "ADO Tasks",
  "panels": [
    {
      "title": "Task Distribution by Type",
      "type": "piechart",
      "targets": [
        {
          "expr": "sum(ado_tasks_total) by (task_type)"
        }
      ]
    },
    {
      "title": "Task Duration Distribution",
      "type": "heatmap",
      "targets": [
        {
          "expr": "sum(rate(ado_tasks_duration_seconds_bucket[5m])) by (le)"
        }
      ]
    },
    {
      "title": "Queue Length Over Time",
      "type": "graph",
      "targets": [
        {
          "expr": "ado_task_queue_length"
        }
      ]
    },
    {
      "title": "Retry Rate",
      "type": "graph",
      "targets": [
        {
          "expr": "sum(rate(ado_tasks_retries_total[5m])) by (task_type)"
        }
      ]
    }
  ]
}
```

### Providers Dashboard

```json
{
  "title": "ADO Providers",
  "panels": [
    {
      "title": "Requests by Provider",
      "type": "graph",
      "targets": [
        {
          "expr": "sum(rate(ado_provider_requests_total[5m])) by (provider)"
        }
      ]
    },
    {
      "title": "Provider Latency (p95)",
      "type": "graph",
      "targets": [
        {
          "expr": "histogram_quantile(0.95, sum(rate(ado_provider_latency_seconds_bucket[5m])) by (provider, le))"
        }
      ]
    },
    {
      "title": "Rate Limit Events",
      "type": "graph",
      "targets": [
        {
          "expr": "sum(increase(ado_provider_rate_limits_total[1h])) by (provider)"
        }
      ]
    },
    {
      "title": "Token Usage",
      "type": "graph",
      "targets": [
        {
          "expr": "sum(rate(ado_provider_tokens_total[5m])) by (provider, direction)"
        }
      ]
    },
    {
      "title": "Cost by Provider",
      "type": "piechart",
      "targets": [
        {
          "expr": "sum(ado_cost_usd_total) by (provider)"
        }
      ]
    }
  ]
}
```

## Logging

### Log Format

```json
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "level": "info",
  "service": "api-gateway",
  "traceId": "abc123",
  "spanId": "def456",
  "message": "Task created",
  "context": {
    "taskId": "task-789",
    "userId": "user-123",
    "taskType": "feature"
  }
}
```

### Log Levels

| Level | Použití |
|-------|---------|
| `error` | Chyby vyžadující pozornost |
| `warn` | Potenciální problémy |
| `info` | Běžné operace |
| `debug` | Detailní informace pro debugging |
| `trace` | Velmi detailní trace informace |

### Konfigurace

```yaml
# ado.config.yaml
logging:
  level: info
  format: json

  # Loki integration
  loki:
    enabled: true
    url: http://loki:3100

  # File logging
  file:
    enabled: true
    path: /var/log/ado
    maxSize: 100M
    maxFiles: 10
```

## Tracing

### OpenTelemetry Integration

```typescript
import { trace, SpanKind } from '@opentelemetry/api';

const tracer = trace.getTracer('ado-orchestrator');

async function executeTask(task: Task) {
  const span = tracer.startSpan('task.execute', {
    kind: SpanKind.INTERNAL,
    attributes: {
      'task.id': task.id,
      'task.type': task.taskType,
      'provider.id': task.providerId,
    },
  });

  try {
    // ... execution
    span.setStatus({ code: SpanStatusCode.OK });
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    throw error;
  } finally {
    span.end();
  }
}
```

### Jaeger Integration

```yaml
# docker-compose.yaml
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"  # UI
      - "14268:14268"  # Collector
    environment:
      - COLLECTOR_ZIPKIN_HOST_PORT=9411
```

```yaml
# ado.config.yaml
telemetry:
  tracing:
    enabled: true
    exporter: jaeger
    endpoint: http://jaeger:14268/api/traces
    sampleRate: 0.1  # 10% sampling
```

## Health Checks

### API Endpoints

```bash
# Basic health
GET /health
# Response: { "status": "healthy" }

# Detailed health
GET /health/detailed
# Response:
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:00Z",
  "components": {
    "database": {
      "status": "up",
      "latency": 5
    },
    "redis": {
      "status": "up",
      "latency": 2
    },
    "workers": {
      "status": "up",
      "healthy": 5,
      "total": 5
    },
    "providers": {
      "claude-code": "available",
      "gemini-cli": "rate_limited"
    }
  }
}

# Readiness
GET /health/ready
# Response: 200 OK or 503 Service Unavailable

# Liveness
GET /health/live
# Response: 200 OK or 503 Service Unavailable
```

### Kubernetes Probes

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
```

---

## Souvislosti

- [Alerting](./alerting.md)
- [Capacity Planning](../03-scaling/capacity-planning.md)
- [Kubernetes Deployment](../01-deployment/kubernetes.md)

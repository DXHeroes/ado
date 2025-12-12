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

ADO používá OpenTelemetry pro distributed tracing across all components včetně LLM calls pomocí LiteLLM built-in podpory.

#### Setup OpenTelemetry

```typescript
// packages/core/src/telemetry/setup.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';

export function setupTelemetry() {
  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'ado-orchestrator',
      [SemanticResourceAttributes.SERVICE_VERSION]: '2.0.0',
    }),
    traceExporter: new JaegerExporter({
      endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
    }),
    spanProcessor: new BatchSpanProcessor(),
  });

  sdk.start();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('Telemetry shut down successfully'))
      .catch((error) => console.error('Error shutting down telemetry', error));
  });
}
```

#### Task Execution Tracing

```typescript
// packages/core/src/telemetry/task-tracer.ts
import { trace, context, SpanKind, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('ado-orchestrator', '2.0.0');

export class TaskTracer {
  /**
   * Trace complete task execution with all phases
   */
  async traceTaskExecution<T>(
    task: Task,
    operation: () => Promise<T>
  ): Promise<T> {
    return await tracer.startActiveSpan(
      'task.execute',
      {
        kind: SpanKind.INTERNAL,
        attributes: {
          'task.id': task.id,
          'task.type': task.taskType,
          'task.priority': task.priority,
          'task.complexity': task.complexity,
        },
      },
      async (span) => {
        try {
          const startTime = Date.now();

          // Execute operation
          const result = await operation();

          // Add completion metrics
          span.setAttributes({
            'task.duration_ms': Date.now() - startTime,
            'task.status': 'completed',
          });

          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.setAttributes({
            'task.error': error.message,
            'task.error.stack': error.stack,
          });

          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });

          span.recordException(error);
          throw error;
        } finally {
          span.end();
        }
      }
    );
  }

  /**
   * Trace individual task phases
   */
  async tracePhase<T>(
    phase: string,
    attributes: Record<string, any>,
    operation: () => Promise<T>
  ): Promise<T> {
    return await tracer.startActiveSpan(
      `task.phase.${phase}`,
      {
        kind: SpanKind.INTERNAL,
        attributes,
      },
      async (span) => {
        try {
          const result = await operation();
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          throw error;
        } finally {
          span.end();
        }
      }
    );
  }
}
```

#### LLM Call Tracing via LiteLLM

```typescript
// packages/core/src/llm/litellm-tracer.ts
/**
 * LiteLLM má built-in OpenTelemetry support
 * Automaticky vytváří spans pro každý LLM call
 */
import { LiteLLM } from 'litellm';

const client = new LiteLLM({
  model: 'claude-sonnet-4-5-20250929',

  // Enable OpenTelemetry tracking
  callbacks: {
    success: (response) => {
      // LiteLLM automatically creates span with attributes:
      // - llm.model: claude-sonnet-4-5-20250929
      // - llm.provider: anthropic
      // - llm.tokens.input: 1500
      // - llm.tokens.output: 800
      // - llm.tokens.total: 2300
      // - llm.cost_usd: 0.0345
      // - llm.latency_ms: 2500
    },
  },
});

/**
 * Custom span annotations for LLM calls
 */
export class LLMCallTracer {
  async traceLLMCall<T>(
    prompt: string,
    model: string,
    operation: () => Promise<T>
  ): Promise<T> {
    return await tracer.startActiveSpan(
      'llm.completion',
      {
        kind: SpanKind.CLIENT,
        attributes: {
          'llm.model': model,
          'llm.prompt.length': prompt.length,
          'llm.temperature': 0.7,
        },
      },
      async (span) => {
        try {
          const startTime = Date.now();

          const result = await operation();

          // Add metrics from response
          span.setAttributes({
            'llm.latency_ms': Date.now() - startTime,
            'llm.tokens.total': result.usage.totalTokens,
            'llm.cost_usd': result.cost,
          });

          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.setAttributes({
            'llm.error': error.message,
          });
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          throw error;
        } finally {
          span.end();
        }
      }
    );
  }
}
```

#### Distributed Tracing Across Agents

```typescript
// packages/core/src/telemetry/distributed-tracer.ts
export class DistributedTracer {
  /**
   * Trace parallel agent work
   */
  async traceParallelAgents(
    agents: AgentTask[],
    operation: (agent: AgentTask) => Promise<AgentResult>
  ): Promise<AgentResult[]> {
    return await tracer.startActiveSpan(
      'agents.parallel_execution',
      {
        kind: SpanKind.INTERNAL,
        attributes: {
          'agents.count': agents.length,
          'agents.ids': agents.map(a => a.id).join(','),
        },
      },
      async (parentSpan) => {
        try {
          // Execute agents in parallel with individual tracing
          const results = await Promise.all(
            agents.map(async (agent, index) => {
              // Create child span for each agent
              return await tracer.startActiveSpan(
                `agent.execute`,
                {
                  kind: SpanKind.INTERNAL,
                  attributes: {
                    'agent.id': agent.id,
                    'agent.index': index,
                    'agent.worktree': agent.worktreePath,
                  },
                },
                async (agentSpan) => {
                  try {
                    const result = await operation(agent);

                    agentSpan.setAttributes({
                      'agent.status': result.status,
                      'agent.files_modified': result.filesModified,
                      'agent.tests_passed': result.testsPassed,
                    });

                    agentSpan.setStatus({ code: SpanStatusCode.OK });
                    return result;
                  } catch (error) {
                    agentSpan.setStatus({
                      code: SpanStatusCode.ERROR,
                      message: error.message,
                    });
                    throw error;
                  } finally {
                    agentSpan.end();
                  }
                }
              );
            })
          );

          // Aggregate results on parent span
          parentSpan.setAttributes({
            'agents.completed': results.filter(r => r.status === 'completed').length,
            'agents.failed': results.filter(r => r.status === 'failed').length,
          });

          parentSpan.setStatus({ code: SpanStatusCode.OK });
          return results;
        } catch (error) {
          parentSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          throw error;
        } finally {
          parentSpan.end();
        }
      }
    );
  }
}
```

#### Cost Tracking per Trace

```typescript
// packages/core/src/telemetry/cost-tracer.ts
export class CostTracer {
  private traceIdToCost = new Map<string, number>();

  /**
   * Track cost per trace
   */
  recordCost(traceId: string, cost: number): void {
    const current = this.traceIdToCost.get(traceId) || 0;
    this.traceIdToCost.set(traceId, current + cost);

    // Annotate active span with cost
    const span = trace.getActiveSpan();
    if (span) {
      span.setAttribute('cost.usd', current + cost);
    }
  }

  /**
   * Get total cost for trace
   */
  getTotalCost(traceId: string): number {
    return this.traceIdToCost.get(traceId) || 0;
  }

  /**
   * Export cost metrics to Prometheus
   */
  exportCostMetrics(): void {
    for (const [traceId, cost] of this.traceIdToCost.entries()) {
      costMetric.inc({ trace_id: traceId }, cost);
    }
  }
}
```

### Span Attributes Conventions

```typescript
// Standardized span attributes for ADO
export const SpanAttributes = {
  // Task attributes
  TASK_ID: 'task.id',
  TASK_TYPE: 'task.type',
  TASK_STATUS: 'task.status',
  TASK_COMPLEXITY: 'task.complexity',
  TASK_DURATION_MS: 'task.duration_ms',

  // Agent attributes
  AGENT_ID: 'agent.id',
  AGENT_TYPE: 'agent.type',
  AGENT_WORKTREE: 'agent.worktree',
  AGENT_BRANCH: 'agent.branch',

  // LLM attributes (LiteLLM built-in)
  LLM_MODEL: 'llm.model',
  LLM_PROVIDER: 'llm.provider',
  LLM_TOKENS_INPUT: 'llm.tokens.input',
  LLM_TOKENS_OUTPUT: 'llm.tokens.output',
  LLM_TOKENS_TOTAL: 'llm.tokens.total',
  LLM_COST_USD: 'llm.cost_usd',
  LLM_LATENCY_MS: 'llm.latency_ms',
  LLM_TEMPERATURE: 'llm.temperature',

  // Workflow attributes (Temporal)
  WORKFLOW_ID: 'workflow.id',
  WORKFLOW_TYPE: 'workflow.type',
  WORKFLOW_RUN_ID: 'workflow.run_id',
  WORKFLOW_TASK_QUEUE: 'workflow.task_queue',

  // Quality gates
  QA_GATE: 'qa.gate',
  QA_PASSED: 'qa.passed',
  QA_ERRORS: 'qa.errors',
  QA_COVERAGE: 'qa.coverage',

  // Cost tracking
  COST_USD: 'cost.usd',
  COST_PROVIDER: 'cost.provider',
  COST_ACCESS_MODE: 'cost.access_mode',
};
```

### Jaeger Integration

```yaml
# docker-compose.yaml
services:
  jaeger:
    image: jaegertracing/all-in-one:1.52
    ports:
      - "16686:16686"  # UI
      - "14268:14268"  # Collector HTTP
      - "14250:14250"  # Collector gRPC
      - "6831:6831/udp"  # Agent (legacy)
    environment:
      - COLLECTOR_ZIPKIN_HOST_PORT=:9411
      - COLLECTOR_OTLP_ENABLED=true
    volumes:
      - jaeger_data:/badger

volumes:
  jaeger_data:
```

### Grafana Tempo Integration (Alternative)

```yaml
# docker-compose.yaml
services:
  tempo:
    image: grafana/tempo:2.3.1
    command: ["-config.file=/etc/tempo.yaml"]
    volumes:
      - ./tempo.yaml:/etc/tempo.yaml
      - tempo_data:/tmp/tempo
    ports:
      - "14268:14268"  # Jaeger ingest
      - "3200:3200"    # Tempo
      - "4317:4317"    # OTLP gRPC
      - "4318:4318"    # OTLP HTTP

volumes:
  tempo_data:
```

```yaml
# tempo.yaml
server:
  http_listen_port: 3200

distributor:
  receivers:
    jaeger:
      protocols:
        thrift_http:
        grpc:
    otlp:
      protocols:
        http:
        grpc:

storage:
  trace:
    backend: local
    local:
      path: /tmp/tempo/blocks
```

### OpenTelemetry Configuration

```yaml
# ado.config.yaml
telemetry:
  # Tracing configuration
  tracing:
    enabled: true
    exporter: jaeger  # or tempo, zipkin
    endpoint: http://jaeger:14268/api/traces

    # Sampling strategy
    sampling:
      type: probabilistic  # or always_on, always_off
      rate: 0.1  # 10% sampling for production, 1.0 for development

    # Span processors
    processors:
      batch:
        enabled: true
        maxQueueSize: 2048
        maxExportBatchSize: 512
        exportTimeout: 30000  # ms

  # LLM-specific tracing
  llm:
    traceCalls: true
    traceTokens: true
    traceCost: true
    traceLatency: true

  # Resource attributes
  resource:
    service.name: ado-orchestrator
    service.version: 2.0.0
    deployment.environment: production
```

### Trace Visualization in Jaeger

```
Example Trace for "Implement Feature" Task:
─────────────────────────────────────────────────────────────────────

task.execute (15.2s)
│
├─ task.phase.specification (2.1s)
│  └─ llm.completion [claude-sonnet] (2.0s)
│     ├─ tokens: 1500 input, 800 output
│     ├─ cost: $0.0345
│     └─ latency: 2000ms
│
├─ task.phase.planning (1.8s)
│  └─ llm.completion [claude-sonnet] (1.7s)
│     ├─ tokens: 2000 input, 1200 output
│     └─ cost: $0.0480
│
├─ task.phase.implementation (8.5s)
│  ├─ agent.execute [agent-1] (4.2s)
│  │  ├─ llm.completion [claude-sonnet] (3.5s)
│  │  ├─ qa.typecheck (0.3s)
│  │  └─ qa.test (0.4s)
│  │
│  └─ agent.execute [agent-2] (4.3s)
│     ├─ llm.completion [claude-sonnet] (3.6s)
│     ├─ qa.typecheck (0.3s)
│     └─ qa.test (0.4s)
│
└─ task.phase.validation (2.8s)
   ├─ qa.lint (0.5s)
   ├─ qa.test (1.8s)
   └─ qa.coverage (0.5s)

Total Cost: $0.1325
Success: ✓
```

### Custom Metrics from Traces

```typescript
// Export custom metrics derived from traces
export class TraceMetricsExporter {
  /**
   * Calculate metrics from trace data
   */
  exportMetrics(trace: Trace): void {
    // LLM call metrics
    const llmSpans = trace.spans.filter(s => s.name.startsWith('llm.'));

    const totalLLMCost = llmSpans.reduce(
      (sum, span) => sum + (span.attributes['llm.cost_usd'] || 0),
      0
    );

    const avgLLMLatency = llmSpans.reduce(
      (sum, span) => sum + (span.attributes['llm.latency_ms'] || 0),
      0
    ) / llmSpans.length;

    // Export to Prometheus
    llmCostMetric.observe(totalLLMCost);
    llmLatencyMetric.observe(avgLLMLatency);

    // Quality gate metrics
    const qaSpans = trace.spans.filter(s => s.name.startsWith('qa.'));
    const qaPassed = qaSpans.every(s => s.attributes['qa.passed']);

    qaPassRateMetric.inc({ passed: qaPassed ? 'true' : 'false' });
  }
}
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

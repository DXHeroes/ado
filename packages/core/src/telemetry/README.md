# ADO Telemetry Module

OpenTelemetry integration for the Agentic Development Orchestrator.

## Features

- **Distributed Tracing** - Track task execution across providers
- **Metrics Collection** - Monitor task duration, token usage, costs
- **Observability** - Export to Jaeger, Prometheus, or any OTLP endpoint

## Usage

### Basic Setup

```typescript
import { createTelemetryService } from "@dxheroes/ado-core/telemetry";

const telemetry = createTelemetryService({
	enabled: true,
	serviceName: "ado-orchestrator",
	serviceVersion: "1.0.0",
	environment: "production",
	tracing: {
		enabled: true,
		endpoint: "http://localhost:4318/v1/traces",
		sampleRate: 1.0,
	},
	metrics: {
		enabled: true,
		endpoint: "http://localhost:4318/v1/metrics",
		interval: 60000,
	},
});
```

### Tracing Task Execution

```typescript
await telemetry.tracer.withSpan("task.execute", async (span) => {
	span.setAttributes({
		"task.id": taskId,
		"task.provider": "claude-code",
	});

	// Execute task
	const result = await executeTask();

	span.setAttributes({
		"task.status": "completed",
		"task.duration": duration,
	});

	return result;
});
```

### Recording Metrics

```typescript
// Record task completion
telemetry.metrics.recordTask("completed", "claude-code", 45.2, {
	access_mode: "subscription",
});

// Record provider request
telemetry.metrics.recordProviderRequest("claude-code", 1234, true, {
	operation: "execute",
});

// Record token usage
telemetry.metrics.recordTokenUsage("claude-code", 1500, 800);

// Record cost
telemetry.metrics.recordCost("claude-code", 0.05, "api");
```

## Configuration

### Environment Variables

```bash
# OpenTelemetry endpoint (Jaeger, Tempo, etc.)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Service name
OTEL_SERVICE_NAME=ado-orchestrator

# Trace sampling rate (0.0 to 1.0)
OTEL_TRACE_SAMPLER_ARG=1.0
```

### Jaeger (Local Development)

```bash
# Run Jaeger all-in-one
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest

# Access UI at http://localhost:16686
```

### Prometheus (Production)

```bash
# Configure Prometheus to scrape OTLP metrics
# Add to prometheus.yml:
scrape_configs:
  - job_name: 'ado-metrics'
    static_configs:
      - targets: ['localhost:4318']
```

## Metrics Reference

### Counters

- `ado.tasks.total` - Total number of tasks
- `ado.provider.requests` - Total provider requests
- `ado.rate_limits.total` - Rate limit hits
- `ado.errors.total` - Total errors

### Histograms

- `ado.task.duration` - Task execution duration (seconds)
- `ado.provider.latency` - Provider request latency (milliseconds)
- `ado.tokens.usage` - Token usage per request
- `ado.cost` - Cost per task (USD)

## Best Practices

1. **Sample Traces in Production** - Use `sampleRate: 0.1` to reduce overhead
2. **Batch Metrics** - Default 60s interval balances freshness and performance
3. **Add Context** - Include relevant attributes in spans and metrics
4. **Monitor Costs** - Track API costs with `recordCost()`
5. **Graceful Shutdown** - Use `setupGracefulShutdown()` to flush data on exit

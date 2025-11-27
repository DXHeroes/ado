# ADO Telemetry Module

OpenTelemetry integration for the Agentic Development Orchestrator.

## Features

- **Distributed Tracing** - Track task execution across providers
- **Metrics Collection** - Monitor task duration, token usage, costs
- **Observability** - Export to Jaeger, Prometheus, or any OTLP endpoint
- **Auto-Detection** - Automatically enables when OTEL environment variables are set

## Quick Start (Auto-Detection)

Telemetry is **automatically enabled** when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. No code changes required!

```bash
# Set the OTLP endpoint - telemetry will automatically start
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Run ADO - telemetry is now active
ado run "Implement feature X"
```

### Supported Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Base OTLP endpoint (required to enable) | - |
| `OTEL_SERVICE_NAME` | Service name for traces/metrics | `ado` |
| `OTEL_TRACE_SAMPLER_ARG` | Trace sampling rate (0.0 to 1.0) | `1.0` |
| `NODE_ENV` | Environment name | `development` |

## Usage

### Auto-Detection (Recommended)

```typescript
import { createTelemetryServiceFromEnv } from "@dxheroes/ado-core";

// Automatically configures from environment variables
// Returns disabled service if OTEL_EXPORTER_OTLP_ENDPOINT is not set
const telemetry = createTelemetryServiceFromEnv("my-service");

if (telemetry.isEnabled()) {
	console.log("Telemetry is active!");
}
```

### Manual Configuration

For advanced use cases, you can manually configure telemetry:

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

## Local Development Setup

### Jaeger (Recommended)

```bash
# Run Jaeger all-in-one
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest

# Set the endpoint
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Access UI at http://localhost:16686
```

### Using Docker Compose

Add to your `docker-compose.yaml`:

```yaml
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"  # UI
      - "4318:4318"    # OTLP HTTP
    environment:
      - COLLECTOR_OTLP_ENABLED=true
```

## Production Setup

### Prometheus

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'ado-metrics'
    static_configs:
      - targets: ['localhost:4318']
```

### Grafana Cloud / Other OTLP Backends

Simply set the endpoint to your OTLP-compatible backend:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.example.com:4318
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer <token>"
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

1. **Just Set the Endpoint** - Auto-detection handles the rest
2. **Sample Traces in Production** - Use `OTEL_TRACE_SAMPLER_ARG=0.1` to reduce overhead
3. **Batch Metrics** - Default 60s interval balances freshness and performance
4. **Add Context** - Include relevant attributes in spans and metrics
5. **Monitor Costs** - Track API costs with `recordCost()`
6. **Graceful Shutdown** - Use `setupGracefulShutdown()` to flush data on exit

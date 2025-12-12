# NFR-001: Performance

## Přehled

ADO musí poskytovat rychlou odezvu a efektivní využití zdrojů ve všech režimech provozu.

## Požadavky

### NFR-001.1: CLI Startup Time

| Metrika | Požadavek | Měření |
|---------|-----------|--------|
| Cold start | < 500ms | První spuštění |
| Warm start | < 200ms | Následná spuštění |
| With plugins | < 1s | S načtenými pluginy |

**Acceptance criteria:**
- [ ] `ado --help` < 200ms
- [ ] `ado run` (do submission) < 500ms
- [ ] Lazy loading pro nepotřebné moduly

### NFR-001.2: API Response Times

| Operace | P50 | P95 | P99 |
|---------|-----|-----|-----|
| Task submit | 100ms | 200ms | 500ms |
| Status query | 50ms | 100ms | 200ms |
| List tasks | 100ms | 300ms | 500ms |
| Checkpoint resolve | 100ms | 200ms | 300ms |

### NFR-001.3: Streaming Latency

| Metrika | Požadavek |
|---------|-----------|
| First byte | < 2s od spuštění agenta |
| Event propagation | < 100ms end-to-end |
| Reconnect time | < 5s |

### NFR-001.4: Resource Utilization

**Controller:**
| Resource | Idle | Active (10 tasks) | Peak (100 tasks) |
|----------|------|-------------------|------------------|
| CPU | < 5% | < 30% | < 70% |
| Memory | < 256MB | < 512MB | < 2GB |
| Connections | < 50 | < 500 | < 2000 |

**Worker:**
| Resource | Idle | Active |
|----------|------|--------|
| CPU | < 5% | < 80% |
| Memory | < 512MB | < 4GB |
| Disk I/O | < 10MB/s | < 100MB/s |

### NFR-001.5: Throughput

| Konfigurace | Tasks/hour | Concurrent tasks |
|-------------|------------|------------------|
| Local (1 worker) | 10-20 | 1-2 |
| Small (5 workers) | 50-100 | 5-10 |
| Medium (20 workers) | 200-400 | 20-40 |
| Large (100 workers) | 500-1000 | 50-100 |

### NFR-001.6: Database Performance

| Operace | Požadavek |
|---------|-----------|
| Insert task | < 10ms |
| Update status | < 10ms |
| Query (indexed) | < 20ms |
| Query (scan) | < 200ms |
| Checkpoint save | < 50ms |

---

## Optimalizační strategie

### Lazy Loading
```typescript
// Load modules only when needed
const adapter = await import(`./adapters/${providerId}`);
```

### Connection Pooling
```yaml
database:
  pool:
    min: 5
    max: 50
    idleTimeout: 30000
```

### Caching
```yaml
cache:
  provider: "redis"
  ttl:
    providerStatus: 60s
    taskStatus: 5s
    config: 300s
```

### Batching
```typescript
// Batch multiple status updates
await batchUpdate(tasks.map(t => ({ id: t.id, status: t.status })));
```

---

## Monitoring

### Key Metrics
- `ado_cli_startup_duration_seconds`
- `ado_api_request_duration_seconds`
- `ado_streaming_latency_seconds`
- `ado_task_throughput_per_hour`
- `ado_resource_cpu_percent`
- `ado_resource_memory_bytes`

### Alerts
```yaml
alerts:
  - name: "High API Latency"
    condition: "p95_latency > 500ms for 5m"
    severity: "warning"

  - name: "Low Throughput"
    condition: "throughput < expected * 0.5 for 10m"
    severity: "critical"
```

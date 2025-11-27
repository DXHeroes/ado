# Performance Optimization Guide

Best practices and configurations for optimal ADO performance.

## Overview

ADO is designed for high performance with:
- CLI startup time < 500ms
- Task submission latency < 100ms
- Streaming response initiation < 2s
- Concurrent task execution
- Efficient state management

## CLI Performance

### Fast Startup

ADO CLI is optimized for fast startup:

```bash
# Measure startup time
time ado --version

# Expected: < 500ms
```

**Optimization techniques:**
- Lazy module loading
- Minimal dependencies in CLI entry point
- Efficient TypeScript compilation with tsup/esbuild
- No unnecessary I/O on startup

### Command Performance

```bash
# Benchmark commands
time ado status
time ado config show
time ado run "simple task"
```

**Tips:**
- Use `--json` flag for faster parsing in scripts
- Cache provider status locally
- Minimize database queries

## Task Execution Performance

### Parallel Execution

Run multiple tasks concurrently:

```yaml
orchestration:
  maxParallelAgents: 10              # Adjust based on CPU cores
  taskQueue:
    concurrency: 5                    # Max concurrent tasks
```

**Recommended settings:**
- **4 CPU cores**: `maxParallelAgents: 4`, `concurrency: 2`
- **8 CPU cores**: `maxParallelAgents: 8`, `concurrency: 4`
- **16+ CPU cores**: `maxParallelAgents: 16`, `concurrency: 8`

### Git Worktree Isolation

Enable for parallel execution without conflicts:

```yaml
orchestration:
  worktreeIsolation: true
```

**Benefits:**
- Isolated file system per agent
- No merge conflicts
- Safe parallel execution

**Trade-offs:**
- Additional disk space (~100MB per worktree)
- Slightly longer setup time

### Provider Selection

Optimize provider routing:

```yaml
routing:
  strategy: "subscription-first"      # Fastest: use subscriptions
  matching:
    preferFasterProvider: true        # Prioritize fast providers
    preferLargerContext: false        # Skip context size checks
```

## State Management Performance

### Database Choice

**SQLite (Local):**
- ✅ Fast for single machine
- ✅ No network overhead
- ❌ Not suitable for distributed

```yaml
storage:
  driver: "sqlite"
  path: ".ado/state.db"
```

**PostgreSQL (Production):**
- ✅ Scalable
- ✅ Concurrent access
- ⚠️ Network latency

```yaml
storage:
  driver: "postgresql"
  connectionString: ${DATABASE_URL}
```

### Rate Limit Tracking

**Memory (Fastest):**
```yaml
storage:
  rateLimitTracking:
    driver: "memory"
```

**Redis (Distributed):**
```yaml
storage:
  rateLimitTracking:
    driver: "redis"
    redisUrl: ${REDIS_URL}
```

### Checkpoint Intervals

Balance safety vs performance:

```yaml
orchestration:
  checkpointInterval: 30              # seconds
```

- **30s**: Good balance (default)
- **60s**: Better performance, more risk
- **10s**: Maximum safety, slower

## Network Performance

### Connection Pooling

PostgreSQL connection pool:

```typescript
// In production configuration
{
  max: 20,              // Max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
}
```

### Request Timeout

Configure timeouts:

```yaml
providers:
  claude-code:
    defaultOptions:
      timeout: 120000   # 2 minutes (milliseconds)
```

### Retry Strategy

Optimize retry behavior:

```yaml
routing:
  failover:
    maxRetries: 3
    retryDelay: 1000    # 1 second
```

## Memory Optimization

### Node.js Heap Size

For large projects:

```bash
# Increase heap size
NODE_OPTIONS="--max-old-space-size=4096" ado run "large task"
```

### Streaming Responses

Enable streaming to reduce memory:

```yaml
providers:
  claude-code:
    capabilities:
      supportsStreaming: true
```

**Benefits:**
- Lower memory usage
- Faster time-to-first-token
- Better user experience

## Monitoring Performance

### Enable Telemetry

Track performance metrics:

```yaml
observability:
  telemetry:
    enabled: true
    metrics:
      enabled: true
```

### Key Metrics to Monitor

1. **Task Duration** (`ado.task.duration`)
2. **Provider Latency** (`ado.provider.latency`)
3. **Database Query Time**
4. **Memory Usage**
5. **CPU Utilization**

### Performance Dashboard

View metrics in Grafana:

```bash
# Import dashboard
kubectl apply -f deploy/grafana/performance-dashboard.yaml
```

## Caching Strategies

### Provider Capability Cache

Cache provider capabilities:

```typescript
// Automatically cached for 1 hour
const capabilities = await provider.getCapabilities();
```

### Context File Cache

Cache context files to avoid re-reading:

```yaml
# Context files cached in memory
contextFile: "CLAUDE.md"
```

### Rate Limit Cache

Cache rate limit status:

```yaml
storage:
  rateLimitTracking:
    driver: "redis"
    ttl: 300            # 5 minutes cache
```

## Resource Limits

### Docker Resource Limits

```yaml
services:
  ado-orchestrator:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          cpus: '0.5'
          memory: 1G
```

### Kubernetes Resource Limits

```yaml
resources:
  limits:
    cpu: 2000m
    memory: 4Gi
  requests:
    cpu: 500m
    memory: 1Gi
```

## Profiling

### CPU Profiling

```bash
# Profile CLI
node --prof $(which ado) run "task"

# Process profile
node --prof-process isolate-*.log > profile.txt
```

### Memory Profiling

```bash
# Generate heap snapshot
node --inspect $(which ado) run "task"

# Use Chrome DevTools to analyze
chrome://inspect
```

### Benchmark Tasks

```bash
# Run benchmark suite
pnpm benchmark

# Results saved to benchmark-results.json
```

## Best Practices

1. **Use Subscription Access** - Faster than API calls
2. **Enable Streaming** - Lower memory, faster responses
3. **Optimize Worker Count** - Match CPU cores
4. **Use Redis for Rate Limits** - Better than database
5. **Monitor Metrics** - Identify bottlenecks
6. **Cache Aggressively** - Reduce redundant operations
7. **Use SQLite Locally** - Faster than PostgreSQL for single machine
8. **Enable Compression** - For large responses
9. **Limit Checkpoint Frequency** - Balance safety and performance
10. **Profile Regularly** - Find performance regressions

## Performance Checklist

- [ ] Enabled telemetry and metrics
- [ ] Set appropriate `maxParallelAgents`
- [ ] Enabled Git worktree isolation
- [ ] Using subscription-first routing
- [ ] Configured connection pooling
- [ ] Set reasonable checkpoint intervals
- [ ] Enabled streaming for providers
- [ ] Using Redis for rate limit tracking (production)
- [ ] Monitoring key metrics in Grafana
- [ ] Regular profiling and benchmarking

## Troubleshooting Performance Issues

### Slow Task Execution

1. Check provider latency
2. Verify network connectivity
3. Monitor rate limits
4. Review checkpoint interval

### High Memory Usage

1. Enable streaming
2. Reduce parallel agents
3. Increase heap size
4. Check for memory leaks

### Database Bottleneck

1. Add connection pooling
2. Use indexes
3. Switch to Redis for rate limits
4. Consider read replicas

### CLI Slow Startup

1. Check for unnecessary imports
2. Profile startup time
3. Lazy load modules
4. Clear cache

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| CLI Startup | < 500ms | `time ado --version` |
| Task Submission | < 100ms | Time to receive task ID |
| Streaming Start | < 2s | Time to first response token |
| Task Execution | Varies | Based on task complexity |
| Memory Usage | < 2GB | For 10 parallel agents |
| CPU Usage | < 70% | At max concurrency |

## Next Steps

- [Monitoring Guide](./monitoring.md)
- [Deployment Guide](./deployment.md)
- [Configuration Reference](./configuration.md)

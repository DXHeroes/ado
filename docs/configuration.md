# Configuration Reference

Complete reference for `ado.config.yaml` configuration file.

## Configuration File Location

ADO looks for configuration in the following order:

1. `./ado.config.yaml` (project root)
2. `~/.config/ado/config.yaml` (user home)
3. Default configuration

## Basic Structure

```yaml
version: "1.1"

project:
  id: "project-name"
  repository: "github.com/org/repo"

providers: { }
routing: { }
orchestration: { }
hitl: { }
storage: { }
observability: { }
deployment: { }
```

## Project Configuration

```yaml
project:
  id: "my-project"                      # Unique project identifier
  repository: "github.com/org/repo"     # Repository URL (optional)
```

## Provider Configuration

Each provider can have multiple access modes with different priorities.

```yaml
providers:
  claude-code:
    enabled: true                        # Master switch
    contextFile: "CLAUDE.md"             # Context file path

    accessModes:
      # Subscription access (highest priority)
      - mode: subscription
        priority: 1                      # Lower = higher priority
        enabled: true
        subscription:
          plan: "max"                    # free, pro, max, team
          rateLimits:
            requestsPerDay: 500
            requestsPerHour: 100
            tokensPerDay: 5000000
          resetTime: "00:00 UTC"

      # API access (fallback)
      - mode: api
        priority: 10
        enabled: true
        api:
          apiKey: ${ANTHROPIC_API_KEY}
          baseUrl: "https://api.anthropic.com"
          rateLimits:
            requestsPerMinute: 50
            tokensPerMinute: 100000
          costPerMillion:
            input: 3.00
            output: 15.00

    # Provider capabilities
    capabilities:
      codeGeneration: true
      codeReview: true
      refactoring: true
      testing: true
      documentation: true
      debugging: true
      languages: ["typescript", "python", "go", "rust"]
      maxContextTokens: 200000
      supportsStreaming: true
      supportsMCP: true
      supportsResume: true

    # Default options for this provider
    defaultOptions:
      model: "claude-sonnet-4-20250514"
      maxTurns: 50
      permissionMode: "acceptEdits"
```

## Routing Configuration

```yaml
routing:
  # Routing strategy
  strategy: "subscription-first"         # subscription-first, round-robin, cost-optimized

  # Failover behavior
  failover:
    enabled: true
    onErrors: ["rate_limit", "timeout", "server_error"]
    maxRetries: 3
    retryDelay: 1000                     # milliseconds

  # API fallback settings
  apiFallback:
    enabled: true
    confirmAboveCost: 1.00               # Ask for confirmation if > $1
    maxCostPerTask: 10.00                # Hard limit per task
    maxDailyCost: 50.00                  # Hard limit per day

  # Task-to-provider matching
  matching:
    preferCapabilityMatch: true
    preferLargerContext: true
    preferFasterProvider: false
```

## Orchestration Configuration

```yaml
orchestration:
  maxParallelAgents: 10                  # Max concurrent agents
  worktreeIsolation: true                # Use Git worktrees
  checkpointInterval: 30                 # Checkpoint every 30s

  taskQueue:
    concurrency: 5                       # Max concurrent tasks
    retryAttempts: 3
    retryDelay: 1000                     # milliseconds
```

## Human-in-the-Loop (HITL)

```yaml
hitl:
  defaultPolicy: "review-edits"          # autonomous, review-edits, approve-steps, manual
  approvalTimeout: 24h                   # How long to wait for approval

  # Cost-based escalation
  escalateOnCost:
    threshold: 5.00                      # Escalate if cost exceeds $5
    channel: "slack"                     # slack, email, webhook

  # Notifications
  notifications:
    slack:
      enabled: true
      webhookUrl: ${SLACK_WEBHOOK_URL}
      channel: "#dev-agents"
      username: "ADO Bot"
      iconEmoji: ":robot_face:"

    email:
      enabled: false
      from: "ado@example.com"
      to: ["dev@example.com"]
      smtp:
        host: "smtp.gmail.com"
        port: 587
        secure: false
        auth:
          user: ${SMTP_USER}
          pass: ${SMTP_PASS}
```

## Storage Configuration

```yaml
storage:
  # State storage
  driver: "sqlite"                       # sqlite, postgresql
  path: ".ado/state.db"                  # SQLite path
  # connectionString: ${DATABASE_URL}    # PostgreSQL URL

  # Rate limit tracking
  rateLimitTracking:
    driver: "memory"                     # memory, redis
    # redisUrl: ${REDIS_URL}
```

## Observability Configuration

```yaml
observability:
  logging:
    level: "info"                        # debug, info, warn, error
    format: "pretty"                     # pretty, json

  costTracking:
    enabled: true
    reportInterval: "daily"              # hourly, daily, weekly

  # OpenTelemetry
  telemetry:
    enabled: true
    serviceName: "ado-orchestrator"
    serviceVersion: "1.0.0"
    environment: "production"

    tracing:
      enabled: true
      endpoint: "http://localhost:4318/v1/traces"
      sampleRate: 1.0                    # 0.0 to 1.0

    metrics:
      enabled: true
      endpoint: "http://localhost:4318/v1/metrics"
      interval: 60000                    # milliseconds
```

## Deployment Configuration

```yaml
deployment:
  default: "local"                       # local, kubernetes

  contexts:
    local:
      type: "docker"

    kubernetes:
      type: "k8s"
      namespace: "ado-system"
      kubeconfig: ${KUBECONFIG}
      replicas: 3
```

## Environment Variable Substitution

Use `${VAR_NAME}` syntax to reference environment variables:

```yaml
providers:
  claude-code:
    accessModes:
      - mode: api
        api:
          apiKey: ${ANTHROPIC_API_KEY}    # Reads from env
```

## CLI Overrides

Configuration can be overridden via CLI flags:

```bash
# Override provider
ado run "task" --provider claude-code

# Override access mode
ado run "task" --access-mode api

# Override cost limit
ado run "task" --max-cost 25.00

# Disable API fallback
ado run "task" --no-api-fallback
```

## Validation

Validate your configuration:

```bash
ado config validate
```

## Examples

See [`ado.config.yaml`](../ado.config.yaml) for a complete example configuration.

## Next Steps

- [Provider Setup](./providers.md)
- [Notifications Configuration](./notifications.md)
- [Deployment Guide](./deployment.md)

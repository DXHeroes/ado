# Remote Execution Guide

Complete guide to using ADO with remote workers, including local, remote, and hybrid execution modes.

## Execution Modes Overview

ADO supports three execution modes:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. LOCAL MODE (Default)                                      │
│                                                               │
│    ┌──────────┐                                              │
│    │   CLI    │ ──executes locally──► │ Local Agent │       │
│    └──────────┘                                              │
│                                                               │
│    - Code stays on your machine                              │
│    - Agent runs on your machine                              │
│    - No network required                                     │
│    - Best for: Individual work, small tasks                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 2. REMOTE MODE                                               │
│                                                               │
│    ┌──────────┐         ┌─────────────┐         ┌─────────┐ │
│    │   CLI    │ ─tRPC──►│ API Gateway │ ───────►│ Worker  │ │
│    │ (Laptop) │         │   (Cloud)   │         │ (Cloud) │ │
│    └────┬─────┘         └─────────────┘         └────┬────┘ │
│         │                                              │     │
│         └────────── WebSocket stream ──────────────────┘     │
│                                                               │
│    - Code fetched from Git                                   │
│    - Agent runs on cloud                                     │
│    - Network required                                        │
│    - Best for: CI/CD, automation                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 3. HYBRID MODE ⭐ (Recommended)                              │
│                                                               │
│    ┌──────────┐         ┌─────────────┐                     │
│    │   CLI    │ ─tRPC──►│ API Gateway │                     │
│    │  + Code  │         │   (Cloud)   │                     │
│    └────┬─────┘         └──────┬──────┘                     │
│         │                      │                             │
│         │               ┌──────┴──────┐                     │
│         │               ▼             ▼                     │
│         ▼          ┌─────────┐   ┌─────────┐               │
│    Local view      │Worker 1 │   │Worker N │               │
│    (streaming)     │ (Cloud) │   │ (Cloud) │               │
│                    └─────────┘   └─────────┘               │
│                                                               │
│    - Code synced from local                                  │
│    - Agent runs on cloud                                     │
│    - Live streaming to local                                 │
│    - Best for: Team work, big tasks ⭐                      │
└─────────────────────────────────────────────────────────────┘
```

## Hybrid Mode Deep Dive

**Hybrid mode is the recommended way to work with remote workers.** You get all the benefits of local development (your code, your editor, your tools) combined with the power of remote execution.

### How It Works

```
┌──────────────────────────────────────────────────────────────┐
│ Step 1: Capture Local Context                                │
│                                                               │
│  $ ado run "Add feature X" --hybrid                          │
│                                                               │
│  CLI captures:                                               │
│  ✓ Current git branch/commit                                 │
│  ✓ Uncommitted changes (optional)                            │
│  ✓ Task prompt and context                                   │
│  ✓ ado.config.yaml                                           │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 2: Upload to Remote                                     │
│                                                               │
│  CLI → API Gateway:                                          │
│  {                                                            │
│    "task": { "prompt": "..." },                              │
│    "context": {                                              │
│      "git": { "branch": "main", "commit": "abc123" },        │
│      "diff": "...",  // uncommitted changes                  │
│      "config": { ... }                                       │
│    }                                                          │
│  }                                                            │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 3: Worker Prepares Environment                          │
│                                                               │
│  Worker on cloud:                                            │
│  1. git clone <your-repo>                                    │
│  2. git checkout main                                        │
│  3. git checkout abc123                                      │
│  4. Apply uncommitted diff                                   │
│  5. Create worktree                                          │
│  6. Ready to execute                                         │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 4: Execute Task                                         │
│                                                               │
│  Worker executes:                                            │
│  - Reads files                                               │
│  - Runs commands                                             │
│  - Makes changes                                             │
│  - Streams output back                                       │
│                                                               │
│  You see in real-time:                                       │
│  ┌────────────────────────────────────────┐                 │
│  │ ● Running agent...                     │                 │
│  │ ✓ Read src/index.ts                    │                 │
│  │ ✓ Modified src/feature.ts              │                 │
│  │ ● Running tests...                     │                 │
│  └────────────────────────────────────────┘                 │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 5: Sync Back Results                                    │
│                                                               │
│  If successful:                                              │
│  1. Worker creates branch: ado/task-123                      │
│  2. Commits changes                                          │
│  3. Pushes to remote                                         │
│                                                               │
│  You locally:                                                │
│  $ git fetch                                                 │
│  $ git checkout ado/task-123                                 │
│  $ git diff main...HEAD                                      │
└──────────────────────────────────────────────────────────────┘
```

### Configuration

```yaml
# ado.config.yaml
remote:
  enabled: true

  # API endpoints
  apiUrl: https://ado.yourcompany.com
  wsUrl: wss://ado.yourcompany.com

  # Default mode
  defaultMode: hybrid  # local | remote | hybrid

  # Authentication
  auth:
    type: api_key
    keyEnvVar: ADO_API_KEY

  # Hybrid mode settings
  hybrid:
    # Git synchronization
    git:
      # Upload uncommitted changes
      uploadUncommitted: true

      # Automatically push results
      autoPush: true

      # Branch naming
      branchPrefix: ado/
      branchFormat: "{{ branchPrefix }}{{ task.id }}"

      # Commit message template
      commitTemplate: |
        {{ task.title }}

        {{ task.description }}

        🤖 Generated by ADO
        Task: {{ task.id }}
        Duration: {{ task.duration }}

      # Create pull request automatically
      autoCreatePR: false

    # File synchronization
    sync:
      # Files to exclude from upload
      exclude:
        - node_modules/
        - .git/
        - dist/
        - build/
        - .env*
        - "*.log"

      # Max upload size (MB)
      maxSize: 50

      # Compression
      compress: true

    # Execution settings
    execution:
      # Isolated git worktree per task
      worktreeIsolation: true

      # Cleanup after completion
      autoCleanup: true

      # Timeout (seconds)
      timeout: 3600

    # Streaming settings
    streaming:
      # Real-time output
      enabled: true

      # Include tool calls in stream
      includeToolCalls: true

      # Buffer size
      bufferSize: 1000

      # Reconnection
      reconnectAttempts: 5
      reconnectDelay: 1000

  # Cost limits
  cost:
    maxCostPerTask: 10.00
    warnAt: 5.00
```

### Environment Setup

```bash
# ~/.ado/.env
ADO_API_KEY=ado_abc123...

# Or use environment variable
export ADO_API_KEY=ado_abc123...

# Or pass as flag
ado run "task" --hybrid --api-key ado_abc123...
```

## CLI Commands

### Basic Execution

```bash
# Local mode (default)
ado run "Add a hello world function"

# Remote mode
ado run "Add a hello world function" --remote

# Hybrid mode
ado run "Add a hello world function" --hybrid

# Use default mode from config
ado run "Add a hello world function"
```

### Advanced Options

```bash
# Specify worker count
ado run "task" --hybrid --workers 5

# Cost limit
ado run "task" --hybrid --max-cost 10

# Timeout
ado run "task" --hybrid --timeout 1800

# Specific provider
ado run "task" --hybrid --provider claude-code

# Git reference
ado run "task" --remote --git-ref feature/new-thing

# Don't upload uncommitted changes
ado run "task" --hybrid --no-uncommitted
```

### Task Management

```bash
# List running tasks
ado tasks

# Attach to running task
ado attach <task-id>

# View logs
ado logs <task-id>
ado logs <task-id> --follow
ado logs <task-id> --tail 100

# Cancel task
ado cancel <task-id>

# Task status
ado status <task-id>

# Download results
ado download <task-id> --output ./results
```

### Worker Management

```bash
# List workers
ado workers list

# Worker status
ado workers status

# Scale workers (if using K8s)
ado workers scale --replicas 10

# Worker health
ado workers health
```

## Streaming Output

### Real-Time Progress

When running in hybrid or remote mode, you see real-time output:

```bash
$ ado run "Add authentication" --hybrid

┌─────────────────────────────────────────────────────────────┐
│ Task: Add authentication                                     │
│ Mode: Hybrid                                                 │
│ Worker: worker-3 (claude-code)                              │
└─────────────────────────────────────────────────────────────┘

⠋ Syncing local changes...
✓ Uploaded 3 modified files (2.4 MB)
✓ Worker cloned repository
✓ Applied local changes

⠋ Executing task...

● Agent started (claude-code)

┌─ Reading files ─────────────────────────────────────────────┐
│ ✓ Read src/auth/index.ts                                    │
│ ✓ Read src/types/user.ts                                    │
│ ✓ Read package.json                                         │
└─────────────────────────────────────────────────────────────┘

┌─ Planning ──────────────────────────────────────────────────┐
│ I'll add JWT-based authentication with:                     │
│ 1. Login/logout endpoints                                   │
│ 2. JWT token generation                                     │
│ 3. Auth middleware                                          │
│ 4. User model updates                                       │
└─────────────────────────────────────────────────────────────┘

┌─ Executing ─────────────────────────────────────────────────┐
│ ✓ Created src/auth/jwt.ts                                   │
│ ✓ Modified src/auth/index.ts                                │
│ ✓ Created src/middleware/auth.ts                            │
│ ✓ Modified src/types/user.ts                                │
│ ⠋ Running tests...                                          │
└─────────────────────────────────────────────────────────────┘

✓ Tests passed (23/23)
✓ Type check passed
✓ Lint passed

⠋ Syncing results...
✓ Committed changes
✓ Pushed to ado/task-abc123

┌─────────────────────────────────────────────────────────────┐
│ ✓ Task completed successfully                               │
│                                                              │
│ Duration: 2m 34s                                            │
│ Cost: $0.42                                                 │
│                                                              │
│ Branch: ado/task-abc123                                     │
│ Commit: def456                                              │
│                                                              │
│ Next steps:                                                 │
│   git fetch                                                 │
│   git checkout ado/task-abc123                              │
│   git diff main...HEAD                                      │
└─────────────────────────────────────────────────────────────┘
```

### Streaming API

You can also consume the stream programmatically:

```typescript
import { AdoClient } from '@dxheroes/ado-client';

const client = new AdoClient({
  apiUrl: 'https://ado.yourcompany.com',
  apiKey: process.env.ADO_API_KEY,
});

// Execute with streaming
const task = await client.tasks.create({
  prompt: 'Add authentication',
  mode: 'hybrid',
});

// Subscribe to events
for await (const event of client.tasks.stream(task.id)) {
  switch (event.type) {
    case 'progress':
      console.log(`Progress: ${event.message}`);
      break;

    case 'tool_call':
      console.log(`Tool: ${event.tool.name}`);
      break;

    case 'file_changed':
      console.log(`File: ${event.file.path}`);
      break;

    case 'completed':
      console.log('Done!', event.result);
      break;

    case 'error':
      console.error('Error:', event.error);
      break;
  }
}
```

## HITL (Human-In-The-Loop)

Remote execution supports interactive prompts:

```bash
$ ado run "Refactor authentication" --hybrid

⠋ Executing task...

● Agent started

┌─ HITL Checkpoint ───────────────────────────────────────────┐
│ I found 3 different authentication methods in the codebase. │
│ Which one should I keep?                                    │
│                                                              │
│ 1. JWT-based (src/auth/jwt.ts)                              │
│ 2. Session-based (src/auth/session.ts)                      │
│ 3. OAuth (src/auth/oauth.ts)                                │
│                                                              │
│ Your choice: _                                              │
└─────────────────────────────────────────────────────────────┘

> 1

⠋ Continuing with JWT-based authentication...
```

Configuration:

```yaml
remote:
  hybrid:
    hitl:
      # Enable HITL checkpoints
      enabled: true

      # Timeout for user response
      timeout: 300  # 5 minutes

      # Notification when HITL required
      notify:
        slack: true
        email: true

      # Automatic escalation
      escalation:
        # Auto-escalate after 5 iterations
        maxIterations: 5

        # Auto-escalate after 30 minutes
        maxDuration: 1800

        # Notification channel
        channel: "#dev-help"
```

## Error Handling

### Automatic Retry

```yaml
remote:
  retry:
    # Max retry attempts
    maxRetries: 3

    # Exponential backoff
    backoff:
      initial: 1000  # 1s
      max: 30000     # 30s
      multiplier: 2

    # Retry conditions
    retryOn:
      - WORKER_DISCONNECTED
      - WORKER_TIMEOUT
      - NETWORK_ERROR
      - RATE_LIMIT

    # Don't retry on
    skipOn:
      - INVALID_PROMPT
      - AUTHENTICATION_FAILED
      - QUOTA_EXCEEDED
```

### Checkpoint Resume

If a worker crashes, ADO can resume from the last checkpoint:

```bash
# Task failed mid-execution
$ ado run "Large refactoring" --hybrid

⠋ Executing task...
✓ Phase 1/5 completed
✓ Phase 2/5 completed
✗ Worker disconnected

# Resume from checkpoint
$ ado resume <task-id>

⠋ Resuming from checkpoint...
✓ Restored state from phase 2/5
⠋ Continuing...
✓ Phase 3/5 completed
...
```

Configuration:

```yaml
remote:
  checkpoints:
    # Enable checkpointing
    enabled: true

    # Checkpoint frequency
    interval: 300  # 5 minutes

    # Storage
    storage: postgresql

    # Retention
    retentionDays: 7
```

## Cost Tracking

### Per-Task Costs

```bash
# View task cost
ado cost <task-id>

┌─────────────────────────────────────────────────────────────┐
│ Task Cost Breakdown                                          │
│                                                              │
│ Provider: claude-code                                        │
│ Mode: subscription (Claude MAX)                              │
│                                                              │
│ Input tokens:   12,453 ($0.15)                              │
│ Output tokens:   8,234 ($0.24)                              │
│ Tool calls:         23 ($0.00)                              │
│                                                              │
│ Total: $0.39                                                │
└─────────────────────────────────────────────────────────────┘
```

### Cost Limits

```bash
# Set cost limit
ado run "task" --hybrid --max-cost 5

# Warn at threshold
ado run "task" --hybrid --warn-at 2.50

# If limit exceeded:
⠋ Executing task...
✓ Phase 1/3 completed ($1.20)
✓ Phase 2/3 completed ($2.80)

⚠ Cost warning: $2.80 / $5.00 (56%)

✓ Phase 3/3 completed ($4.90)

✓ Task completed ($4.90 total)
```

### Team Budgets

```yaml
# ado.config.yaml
cost:
  # Team budgets
  teams:
    frontend:
      daily: 50.00
      monthly: 1000.00
      members:
        - alice@example.com
        - bob@example.com

    backend:
      daily: 100.00
      monthly: 2000.00
      members:
        - charlie@example.com

  # Alerts
  alerts:
    # Slack notification
    slack:
      enabled: true
      webhook: ${SLACK_WEBHOOK_URL}
      threshold: 80  # Alert at 80% of budget

    # Email notification
    email:
      enabled: true
      recipients:
        - finance@example.com
      threshold: 90
```

## Security

### Authentication Methods

#### API Key (Simple)

```bash
# Set API key
export ADO_API_KEY=ado_abc123...

# Or in config
echo "ADO_API_KEY=ado_abc123..." >> ~/.ado/.env
```

#### JWT (Team)

```yaml
# ado.config.yaml
remote:
  auth:
    type: jwt
    provider: auth0
    clientId: ${AUTH0_CLIENT_ID}
    clientSecret: ${AUTH0_CLIENT_SECRET}
    audience: https://ado.yourcompany.com
```

```bash
# Login
ado login

# Opens browser, authenticates
# JWT stored in ~/.ado/auth.json
```

#### OAuth (Enterprise)

```yaml
remote:
  auth:
    type: oauth
    provider: github
    scopes: [read:user, read:org]
```

```bash
# Login with GitHub
ado login --provider github

# Verify
ado whoami
# Logged in as: alice (alice@example.com)
# Organization: acme-corp
# Tier: Enterprise
```

### Code Security

```yaml
remote:
  security:
    # Don't upload secrets
    excludeSecrets: true

    # Detect common secret patterns
    secretPatterns:
      - ".*_API_KEY.*"
      - ".*_SECRET.*"
      - ".*_TOKEN.*"
      - ".*password.*"

    # Scan with trufflehog
    scanSecrets: true

    # Warning on sensitive files
    warnOnFiles:
      - ".env*"
      - "*credentials*"
      - "*.pem"
      - "*.key"
```

## Monitoring & Debugging

### Metrics

```bash
# Real-time metrics
ado metrics

┌─────────────────────────────────────────────────────────────┐
│ ADO Metrics                                                  │
│                                                              │
│ Workers:                                                     │
│   Active:     8 / 10                                        │
│   Idle:       2                                             │
│   Unhealthy:  0                                             │
│                                                              │
│ Tasks:                                                       │
│   Running:    8                                             │
│   Queued:     3                                             │
│   Completed:  1,247                                         │
│   Failed:     23                                            │
│                                                              │
│ Costs (today):                                              │
│   Total:      $127.43                                       │
│   Limit:      $500.00                                       │
│   Usage:      25%                                           │
└─────────────────────────────────────────────────────────────┘
```

### Tracing

```bash
# Get trace for task
ado trace <task-id>

# Opens Jaeger UI with trace
```

### Debugging

```bash
# Enable debug logging
ado run "task" --hybrid --debug

# Or via environment
DEBUG=ado:* ado run "task" --hybrid

# View internal state
ado debug state <task-id>

# View worker logs
ado debug worker <worker-id>
```

## Best Practices

### When to Use Each Mode

| Mode | Use Case | Example |
|------|----------|---------|
| **Local** | Quick tasks, testing, no network | "Fix typo in README" |
| **Remote** | CI/CD, automation, scheduled tasks | GitHub Actions workflow |
| **Hybrid** | Team development, big features | "Implement authentication" |

### Optimizing Hybrid Mode

1. **Keep Git Clean**
   ```bash
   # Commit your work before running
   git add .
   git commit -m "WIP"
   ado run "Continue this work" --hybrid
   ```

2. **Use `.adoignore`**
   ```
   # .adoignore (like .gitignore)
   node_modules/
   .next/
   dist/
   *.log
   .env*
   ```

3. **Batch Similar Tasks**
   ```bash
   # Bad (3 separate tasks)
   ado run "Add user model" --hybrid
   ado run "Add auth endpoints" --hybrid
   ado run "Add tests" --hybrid

   # Good (1 task with subtasks)
   ado run "Implement authentication (model, endpoints, tests)" --hybrid
   ```

4. **Set Appropriate Timeouts**
   ```yaml
   remote:
     hybrid:
       execution:
         # Short tasks
         timeout: 600  # 10 min

         # Long refactoring
         timeout: 3600  # 1 hour
   ```

### Cost Optimization

1. **Use Subscriptions First**
   ```yaml
   providers:
     claude-code:
       accessModes:
         - mode: subscription  # Try this first
           priority: 1
         - mode: api           # Fallback
           priority: 2
   ```

2. **Set Cost Limits**
   ```bash
   ado run "task" --hybrid --max-cost 5
   ```

3. **Monitor Team Spending**
   ```bash
   # Weekly report
   ado cost report --period week
   ado cost report --team frontend
   ```

4. **Use Cheaper Providers for Simple Tasks**
   ```yaml
   # Task classification
   autonomous:
     classification:
       rules:
         - pattern: "fix typo|update docs"
           provider: gemini-cli  # Cheaper
           cost: low

         - pattern: "implement feature|refactor"
           provider: claude-code  # More capable
           cost: high
   ```

## Next Steps

- [Coolify Deployment](./COOLIFY_DEPLOYMENT.md) - Deploy remote workers
- [Team Setup](./TEAM_SETUP.md) - Configure for team use
- [Cost Optimization](./COST_OPTIMIZATION.md) - Minimize spending
- [API Reference](./api-reference.md) - Programmatic access

## Troubleshooting

### Connection Issues

```bash
# Test connection
ado ping

# If fails:
# 1. Check API URL
ado config get remote.apiUrl

# 2. Check API key
ado whoami

# 3. Check network
curl https://ado.yourcompany.com/health

# 4. Check firewall (needs WSS)
```

### Sync Issues

```bash
# Task failed to sync back

# 1. Check worker logs
ado logs <task-id>

# 2. Manual download
ado download <task-id>

# 3. Check git credentials
ado config get remote.hybrid.git
```

### High Costs

```bash
# 1. Review recent tasks
ado cost history --limit 10

# 2. Find expensive tasks
ado cost top --period day

# 3. Check provider usage
ado cost by-provider

# 4. Set limits
ado config set cost.maxCostPerTask 5.00
```

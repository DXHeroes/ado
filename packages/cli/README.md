# @dxheroes/ado-cli

Command-line interface for ADO (Agentic Development Orchestrator).

## Installation

### Global Installation

```bash
# Using npm
npm install -g @dxheroes/ado-cli

# Using pnpm (recommended)
pnpm add -g @dxheroes/ado-cli

# Using npx (no installation)
npx @dxheroes/ado-cli init
```

### Prerequisites

- Node.js 22+ LTS
- pnpm 9.x (recommended)
- At least one AI coding agent installed:
  - [Claude Code](https://claude.ai/code) - `npm install -g @anthropic-ai/claude-code`
  - [Gemini CLI](https://github.com/google/gemini-cli) (if available)
  - [Cursor CLI](https://cursor.sh) (if available)

## Quick Start

```bash
# Initialize ADO in your project
ado init

# Run a task
ado run "Implement user authentication with JWT"

# Check status
ado status

# Start web dashboard
ado dashboard
```

## Commands

### Task Execution

#### `ado run <prompt>`

Execute a task with the orchestrator.

```bash
# Basic task execution
ado run "Add user authentication"

# With provider selection
ado run "Add tests" --provider claude-code

# Remote execution (requires K8s)
ado run "Build feature" --remote

# With quality gates
ado run "Implement API" --validate --coverage 80

# Dry run (show execution plan)
ado run "Refactor code" --dry-run
```

**Options:**
- `--provider <id>` - Force specific provider
- `--remote` - Execute on remote worker (K8s)
- `--validate` - Enable quality validation
- `--coverage <number>` - Minimum test coverage (default: 80)
- `--dry-run` - Show execution plan without executing
- `--checkpoint` - Enable manual checkpoints
- `--no-hitl` - Disable HITL escalation

#### `ado status`

Show current task status and execution history.

```bash
# Show current task
ado status

# Show all tasks
ado status --all

# Show specific task
ado status <task-id>

# Watch mode (auto-refresh)
ado status --watch
```

### Workflow Management

#### `ado workflow run <file>`

Run workflow from YAML file.

```bash
# Run workflow
ado workflow run workflow.yaml

# Run with variables
ado workflow run workflow.yaml --var env=production

# Run specific step
ado workflow run workflow.yaml --step deploy

# Parallel execution
ado workflow run workflow.yaml --parallel
```

**Workflow File Example:**

```yaml
version: "1.0"
name: "Feature Development"

steps:
  - id: specify
    type: spec-generation
    prompt: "User authentication feature"

  - id: plan
    type: planning
    depends: [specify]

  - id: implement
    type: task
    depends: [plan]
    prompt: "Implement based on plan"
    validate: true

  - id: test
    type: task
    depends: [implement]
    prompt: "Write tests"
    coverage: 80
```

#### `ado workflow list`

List all workflows in current project.

```bash
ado workflow list

# With details
ado workflow list --detailed
```

#### `ado workflow validate <file>`

Validate workflow definition.

```bash
ado workflow validate workflow.yaml

# Strict validation
ado workflow validate workflow.yaml --strict
```

### Configuration

#### `ado config show`

Show current configuration.

```bash
# Show all configuration
ado config show

# Show specific section
ado config show providers
ado config show routing
ado config show checkpoints
```

#### `ado config set <key> <value>`

Set configuration value.

```bash
# Enable/disable provider
ado config set providers.claude-code.enabled true

# Set routing strategy
ado config set routing.strategy subscription-first

# Set checkpoint thresholds
ado config set checkpoints.escalationThresholds.maxIterations 5
ado config set checkpoints.escalationThresholds.maxDuration 1800000

# Set parallelization
ado config set parallelization.enabled true
ado config set parallelization.maxWorkers 5
ado config set parallelization.costStrategy minimize-cost
```

#### `ado config providers` (Legacy)

Interactive provider configuration wizard.

```bash
ado config providers
```

### Dashboard & Monitoring

#### `ado dashboard`

Start web dashboard.

```bash
# Start dashboard (default port 3000)
ado dashboard

# Custom port
ado dashboard --port 8080

# Open browser automatically
ado dashboard --open

# Remote mode (K8s deployment)
ado dashboard --remote
```

Dashboard features:
- Real-time task monitoring
- Cost analytics
- Provider usage statistics
- Parallel execution visualization
- Worker health status
- Telemetry traces

### Notifications

#### `ado notify <channel>`

Send test notification.

```bash
# Test Slack notification
ado notify slack

# Test email notification
ado notify email

# Test webhook notification
ado notify webhook

# Send custom message
ado notify slack --message "Test notification"
```

**Configuration:**

```yaml
notifications:
  slack:
    enabled: true
    webhookUrl: "https://hooks.slack.com/..."
    channel: "#ado-notifications"
    events: [task-completed, task-failed, hitl-required]

  email:
    enabled: true
    smtp:
      host: "smtp.gmail.com"
      port: 587
      user: "your-email@gmail.com"
      password: "${SMTP_PASSWORD}"
    from: "ado@example.com"
    to: ["dev-team@example.com"]

  webhook:
    enabled: true
    url: "https://your-api.com/webhooks/ado"
    events: [task-completed, task-failed]
```

### Reports

#### `ado report`

Generate compliance and analytics reports.

```bash
# Generate compliance report
ado report

# Export to file
ado report --output report.json

# Specific report type
ado report --type cost
ado report --type usage
ado report --type compliance
```

### Initialization (Legacy)

#### `ado init`

Initialize ADO configuration in project.

```bash
# Interactive initialization
ado init

# Accept defaults (non-interactive)
ado init -y

# Overwrite existing configuration
ado init -f

# Specify config file
ado init --config custom-ado.config.yaml
```

Creates:
- `ado.config.yaml` - Main configuration
- `CLAUDE.md` - Context for Claude Code
- `AGENTS.md` - Context for all agents
- `.ado/` - State directory

## Configuration

### Configuration File: `ado.config.yaml`

```yaml
version: "1.1"

# Project identification
project:
  id: "my-project"
  name: "My Project"

# Provider configuration
providers:
  claude-code:
    enabled: true
    accessModes:
      - mode: subscription
        priority: 1
        enabled: true
        subscription:
          plan: "max"
          rateLimits:
            requestsPerDay: 500
            requestsPerHour: 100
      - mode: api
        priority: 10
        enabled: false
        api:
          key: "${ANTHROPIC_API_KEY}"
    capabilities:
      codeGeneration: true
      testing: true
      refactoring: true
      debugging: true
    contextFile: "CLAUDE.md"

  gemini-cli:
    enabled: false
    accessModes:
      - mode: api
        priority: 10
        api:
          key: "${GOOGLE_API_KEY}"

# Routing strategy
routing:
  strategy: "subscription-first"  # or "api-first", "cost-optimized"
  apiFallback:
    enabled: false
    threshold: 0.9  # Switch to API if subscription at 90%

# Checkpoints and HITL
checkpoints:
  enabled: true
  autoSave: true
  escalationThresholds:
    maxIterations: 5      # Escalate after 5 failed iterations
    maxDuration: 1800000  # Escalate after 30 minutes (ms)

# Quality validation
quality:
  enabled: true
  gates:
    build: true
    test: true
    lint: true
    coverage: 80  # Minimum 80% test coverage

# Parallelization
parallelization:
  enabled: false
  maxWorkers: 5
  costStrategy: "minimize-cost"  # or "balanced", "maximize-performance"
  worktreeIsolation: true
  autoscaling:
    enabled: false
    minWorkers: 2
    maxWorkers: 10

# Telemetry
telemetry:
  enabled: true
  endpoint: "http://localhost:4318"
  serviceName: "ado-cli"
  traces: true
  metrics: true
  logs: true

# Notifications
notifications:
  slack:
    enabled: false
    webhookUrl: "${SLACK_WEBHOOK_URL}"
    channel: "#ado-notifications"
    events:
      - task-completed
      - task-failed
      - hitl-required

# State persistence
state:
  type: "sqlite"  # or "postgresql"
  sqlite:
    path: ".ado/state.db"
  # postgresql:
  #   host: "localhost"
  #   port: 5432
  #   database: "ado"
  #   user: "ado"
  #   password: "${POSTGRES_PASSWORD}"

# Deployment context
deployment:
  context: "local"  # or "kubernetes"
  kubernetes:
    namespace: "ado"
    workerImage: "dxheroes/ado-worker:latest"
```

### Environment Variables

```bash
# API Keys
export ANTHROPIC_API_KEY="sk-ant-..."
export GOOGLE_API_KEY="..."
export OPENAI_API_KEY="sk-..."

# Notifications
export SLACK_WEBHOOK_URL="https://hooks.slack.com/..."
export SMTP_PASSWORD="..."

# Database
export POSTGRES_PASSWORD="..."

# Telemetry
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
```

## Examples

### Basic Task Execution

```bash
# Simple task
ado run "Add user registration endpoint"

# With validation
ado run "Implement payment processing" --validate --coverage 85

# Force specific provider
ado run "Write integration tests" --provider claude-code
```

### Doc-First Workflow

```bash
# Create workflow file
cat > feature-workflow.yaml <<EOF
version: "1.0"
name: "Auth Feature"
steps:
  - id: specify
    type: spec-generation
    prompt: "JWT authentication"
  - id: plan
    type: planning
    depends: [specify]
  - id: implement
    type: task
    depends: [plan]
    validate: true
EOF

# Run workflow
ado workflow run feature-workflow.yaml
```

### Parallel Execution

```bash
# Enable parallelization
ado config set parallelization.enabled true
ado config set parallelization.maxWorkers 5

# Run tasks in parallel
ado run "Implement microservices: user-service, auth-service, payment-service" --parallel
```

### Remote Execution (Kubernetes)

```bash
# Configure K8s deployment
ado config set deployment.context kubernetes
ado config set deployment.kubernetes.namespace ado-workers

# Run on remote worker
ado run "Train ML model" --remote
```

### Cost Optimization

```bash
# Set cost-aware strategy
ado config set parallelization.costStrategy minimize-cost

# Show cost report
ado report --type cost
```

## Development

```bash
# Clone repository
git clone https://github.com/dxheroes/ado
cd ado

# Install dependencies
pnpm install

# Build CLI
pnpm --filter @dxheroes/ado-cli build

# Run in development
pnpm --filter @dxheroes/ado-cli dev

# Run CLI locally
pnpm --filter @dxheroes/ado-cli start run "Test task"
```

## Troubleshooting

### Command Not Found

```bash
# Ensure global installation
pnpm add -g @dxheroes/ado-cli

# Or use npx
npx @dxheroes/ado-cli --help
```

### Rate Limit Errors

```bash
# Check provider status
ado status

# Configure API fallback
ado config set routing.apiFallback.enabled true
```

### Validation Failures

```bash
# Lower coverage threshold
ado run "Add feature" --coverage 70

# Disable validation
ado run "Quick fix" --no-validate
```

### Dashboard Not Starting

```bash
# Check port availability
ado dashboard --port 8080

# Check logs
ado dashboard --verbose
```

## License

MIT © DX Heroes

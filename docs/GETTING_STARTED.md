# Getting Started with ADO

Complete step-by-step guide to setting up and using ADO (Agentic Development Orchestrator).

## Table of Contents

1. [Introduction](#introduction)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Initial Setup](#initial-setup)
5. [First Task](#first-task)
6. [Configuration](#configuration)
7. [Working with Multiple Providers](#working-with-multiple-providers)
8. [Using Workflows](#using-workflows)
9. [Monitoring and Dashboards](#monitoring-and-dashboards)
10. [Next Steps](#next-steps)

---

## Introduction

ADO orchestrates multiple AI coding agents (Claude Code, Gemini CLI, Cursor, GitHub Copilot) behind a unified interface with **subscription-first routing** that maximizes value from your existing subscriptions.

### Key Benefits

- **Single CLI** for all AI coding agents
- **Automatic failover** when rate limits are hit
- **Cost optimization** by prioritizing subscriptions
- **Task persistence** and history tracking
- **Web dashboard** for real-time monitoring

### What You'll Build

By the end of this guide, you'll have:
- ADO installed and configured
- At least one AI agent connected
- Successfully executed tasks
- A running web dashboard
- Understanding of workflows and advanced features

**Time required**: 30-45 minutes

---

## Prerequisites

### Required Software

1. **Node.js 22+**
   ```bash
   node --version  # Should be v22.0.0 or higher
   ```

   Install from [nodejs.org](https://nodejs.org/) or use a version manager:
   ```bash
   # Using nvm
   nvm install 22
   nvm use 22

   # Using fnm
   fnm install 22
   fnm use 22
   ```

2. **pnpm 9+** (recommended) or npm
   ```bash
   # Install pnpm globally
   npm install -g pnpm

   # Verify
   pnpm --version  # Should be 9.0.0 or higher
   ```

3. **Git** (for version control)
   ```bash
   git --version
   ```

### Recommended Accounts

- **Anthropic Account** for Claude Code (free tier available, Claude MAX recommended)
- **Google Account** for Gemini CLI (optional)
- **Cursor Pro** subscription (optional)
- **GitHub Copilot** subscription (optional)

---

## Installation

### Step 1: Install ADO

```bash
# Using pnpm (recommended)
pnpm install -g @dxheroes/ado

# Or using npm
npm install -g @dxheroes/ado

# Verify installation
ado --version
```

**Expected output**:
```
ado version 2.1.0
```

### Step 2: Install AI Coding Agents

You need at least one AI agent installed. We'll start with Claude Code:

#### Claude Code (Recommended)

```bash
# Install Claude Code CLI
npm install -g @anthropic-ai/claude-code

# Verify
claude --version
```

#### Gemini CLI (Optional)

```bash
# Install Gemini CLI
npm install -g @google/gemini-cli

# Verify
gemini --version
```

#### Cursor CLI (Optional)

```bash
# Install Cursor IDE from https://cursor.sh
# CLI is included with installation

# Verify (macOS)
/Applications/Cursor.app/Contents/Resources/app/bin/cursor --version

# Add to PATH for convenience
export PATH="$PATH:/Applications/Cursor.app/Contents/Resources/app/bin"
```

#### GitHub Copilot CLI (Optional)

```bash
# Install Copilot CLI
npm install -g @githubnext/github-copilot-cli

# Verify
github-copilot-cli --version
```

### Troubleshooting Installation

If you encounter issues, see [Troubleshooting Guide](./TROUBLESHOOTING.md#installation-issues).

---

## Initial Setup

### Step 1: Authenticate AI Agents

#### Claude Code

```bash
# Login to Anthropic account
claude login

# Verify authentication
claude whoami
```

**Expected output**:
```
Logged in as: your-email@example.com
Plan: Claude MAX (or Free)
```

#### Gemini CLI

```bash
# Authenticate with Google
gemini auth

# Or use API key
export GOOGLE_API_KEY="your-api-key"
gemini config set apiKey $GOOGLE_API_KEY
```

#### GitHub Copilot

```bash
# Authenticate with GitHub
github-copilot-cli auth
```

### Step 2: Initialize ADO in Your Project

```bash
# Navigate to your project directory
cd your-project

# Initialize ADO
ado init
```

**What happens**:
1. Creates `ado.config.yaml` with default configuration
2. Creates `CLAUDE.md` context file for Claude Code
3. Creates `.ado/` directory for state management
4. Initializes SQLite database at `.ado/state.db`

**Expected output**:
```
✓ Configuration file created: ado.config.yaml
✓ Context file created: CLAUDE.md
✓ State directory created: .ado/
✓ Database initialized: .ado/state.db

ADO is ready to use!
```

### Step 3: Verify Setup

```bash
# Check provider status
ado status
```

**Expected output**:
```
ADO Status

Project: your-project
Version: 2.1.0

Providers:
✓ claude-code       [available] subscription
  gemini-cli        [not configured]
  cursor-cli        [not installed]

Routing Strategy: subscription-first
State: .ado/state.db (0 tasks)
```

---

## First Task

Let's execute your first task with ADO!

### Example 1: Simple Code Generation

```bash
ado run "Create a function that checks if a number is prime"
```

**What happens**:
1. ADO receives the prompt
2. Router selects `claude-code` (highest priority subscription)
3. Adapter executes task via Claude Code CLI
4. Progress is streamed to terminal
5. Result is saved to state database

**Expected output**:
```
⚡ Starting task: Create a function that checks if a number is prime

Provider: claude-code (subscription)
Status: running

[Claude Code output...]

✓ Task completed successfully
Duration: 8.2s
Files changed: 1
  + src/utils/math.ts

View details: ado status
```

### Example 2: File Modification

```bash
ado run "Add error handling to the UserService class"
```

### Example 3: Documentation

```bash
ado run "Generate JSDoc comments for all functions in src/api/"
```

### View Task History

```bash
# List all tasks
ado status

# View specific task
ado status <task-id>
```

---

## Configuration

### Understanding `ado.config.yaml`

ADO uses a YAML configuration file. Let's explore it:

```yaml
version: "1.1"

# Project identification
project:
  id: "your-project"
  name: "Your Project"

# Provider configuration
providers:
  # Claude Code configuration
  claude-code:
    enabled: true
    capabilities:
      codeGeneration: true
      refactoring: true
      debugging: true
    accessModes:
      # Subscription mode (priority 1)
      - mode: subscription
        priority: 1
        enabled: true
        subscription:
          plan: "max"  # or "free"
          rateLimits:
            requestsPerDay: 500
            tokensPerRequest: 100000

      # API mode (fallback, priority 10)
      - mode: api
        priority: 10
        enabled: false
        apiKey: "${ANTHROPIC_API_KEY}"
        rateLimits:
          requestsPerMinute: 50
          tokensPerRequest: 100000

# Routing strategy
routing:
  strategy: "subscription-first"  # or "cost-optimized", "performance-first"
  apiFallback:
    enabled: false  # Enable API fallback when subscription exhausted

# State management
state:
  backend: "sqlite"  # or "postgresql"
  path: ".ado/state.db"

# Checkpoints (for autonomous workflow)
checkpoints:
  enabled: true
  autoSave: true
  interval: 300000  # 5 minutes
  maxHistory: 10
  escalationThresholds:
    maxIterations: 5
    maxDuration: 1800000  # 30 minutes

# Parallelization (requires M9 implementation)
parallelization:
  enabled: false
  maxWorkers: 5
  costStrategy: "minimize-cost"  # or "balanced", "maximize-performance"

# Notifications
notifications:
  slack:
    enabled: false
    webhookUrl: "${SLACK_WEBHOOK_URL}"
  email:
    enabled: false
    smtpHost: "${SMTP_HOST}"
    from: "${EMAIL_FROM}"
    to: ["${EMAIL_TO}"]

# Telemetry
telemetry:
  enabled: false
  serviceName: "ado"
  exporters:
    otlp:
      endpoint: "${OTEL_EXPORTER_OTLP_ENDPOINT}"
```

### Customizing Configuration

#### Enable Multiple Providers

```yaml
providers:
  claude-code:
    enabled: true
    accessModes:
      - mode: subscription
        priority: 1

  gemini-cli:
    enabled: true
    accessModes:
      - mode: subscription
        priority: 2

  cursor-cli:
    enabled: true
    accessModes:
      - mode: subscription
        priority: 3
```

#### Enable API Fallback

```yaml
routing:
  strategy: "subscription-first"
  apiFallback:
    enabled: true  # Use API when subscription exhausted

providers:
  claude-code:
    accessModes:
      - mode: subscription
        priority: 1
      - mode: api
        priority: 10
        enabled: true
        apiKey: "${ANTHROPIC_API_KEY}"
```

#### Environment Variables

Create `.env` file:

```bash
# API Keys
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
OPENAI_API_KEY=sk-...

# Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/...

# Telemetry
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

Load environment:

```bash
# Load .env before running ADO
export $(cat .env | xargs)
ado run "Your task"
```

---

## Working with Multiple Providers

### Automatic Provider Selection

ADO automatically selects the best provider based on:
1. **Priority**: Lower number = higher priority
2. **Availability**: Must be installed and authenticated
3. **Rate limits**: Skips providers that are rate-limited
4. **Capabilities**: Matches task requirements

### Manual Provider Selection

```bash
# Force specific provider
ado run "Your task" --provider gemini-cli

# Exclude provider
ado run "Your task" --exclude claude-code
```

### Failover Example

```yaml
providers:
  claude-code:
    enabled: true
    accessModes:
      - mode: subscription
        priority: 1
        rateLimits:
          requestsPerDay: 500

  gemini-cli:
    enabled: true
    accessModes:
      - mode: subscription
        priority: 2
        rateLimits:
          requestsPerDay: 1000
```

**Behavior**:
1. ADO tries `claude-code` first (priority 1)
2. If rate-limited, switches to `gemini-cli` (priority 2)
3. Logs failover: `⚠️  Rate limit detected for claude-code, switching to gemini-cli`

---

## Using Workflows

Workflows define multi-step tasks with dependencies.

### Create a Workflow

Create `feature-workflow.yaml`:

```yaml
version: "1.0"
name: "Feature Development Workflow"
description: "Complete feature development pipeline"

tasks:
  # Step 1: Generate specification
  - id: "specification"
    prompt: |
      Create a detailed specification for a user authentication feature.
      Include:
      - Requirements
      - API endpoints
      - Data models
      - Security considerations
    provider: "claude-code"

  # Step 2: Implement feature
  - id: "implementation"
    prompt: |
      Implement the user authentication feature based on the specification.
      Create:
      - Authentication service
      - API endpoints
      - Database migrations
    dependsOn: ["specification"]
    provider: "claude-code"

  # Step 3: Write tests
  - id: "testing"
    prompt: |
      Write comprehensive unit and integration tests for the authentication feature.
      Ensure ≥80% code coverage.
    dependsOn: ["implementation"]
    provider: "gemini-cli"

  # Step 4: Generate documentation
  - id: "documentation"
    prompt: |
      Generate API documentation for the authentication endpoints.
      Include examples and error responses.
    dependsOn: ["implementation"]
    provider: "cursor-cli"
```

### Run Workflow

```bash
# Execute workflow
ado workflow run feature-workflow.yaml

# Monitor progress
ado workflow status

# View specific workflow
ado workflow status <workflow-id>
```

### Workflow Output

```
⚡ Starting workflow: Feature Development Workflow

Tasks: 4
  [1/4] specification (claude-code)
  [2/4] implementation (claude-code) - waiting for [specification]
  [3/4] testing (gemini-cli) - waiting for [implementation]
  [4/4] documentation (cursor-cli) - waiting for [implementation]

Running: specification
[Claude Code output...]
✓ specification completed (12.4s)

Running: implementation
[Claude Code output...]
✓ implementation completed (45.2s)

Running in parallel:
  - testing (gemini-cli)
  - documentation (cursor-cli)

[Parallel execution...]
✓ testing completed (23.1s)
✓ documentation completed (18.7s)

✓ Workflow completed successfully
Total duration: 1m 39.4s
```

---

## Monitoring and Dashboards

### Web Dashboard

Start the built-in web dashboard:

```bash
ado dashboard
```

**Features**:
- Real-time task monitoring
- Provider status and health
- Cost tracking
- Task history and analytics
- Interactive charts (using Recharts)

Access at: `http://localhost:3000`

### Command-Line Monitoring

```bash
# Show current status
ado status

# Watch status in real-time
watch -n 1 ado status

# Show provider details
ado status --providers

# Show cost summary
ado report
```

### Notifications

#### Slack Notifications

```yaml
# ado.config.yaml
notifications:
  slack:
    enabled: true
    webhookUrl: "${SLACK_WEBHOOK_URL}"
    events:
      - task.completed
      - task.failed
      - provider.rate-limited
```

Test notification:

```bash
export SLACK_WEBHOOK_URL="https://hooks.slack.com/..."
ado notify slack
```

#### Email Notifications

```yaml
notifications:
  email:
    enabled: true
    smtpHost: "${SMTP_HOST}"
    smtpPort: 587
    from: "ado@yourcompany.com"
    to: ["team@yourcompany.com"]
    events:
      - task.failed
```

---

## Next Steps

### Learn Advanced Features

1. **Autonomous Workflow** (M8)
   - Task decomposition
   - Doc-first pipeline
   - HITL checkpoints
   - Auto-fix engine

2. **Distributed Execution** (M7)
   - Remote workers
   - Kubernetes deployment
   - State synchronization

3. **Parallelization** (M9)
   - Parallel task execution
   - Git worktree isolation
   - Cost-aware load balancing

### Explore Documentation

- [Configuration Reference](./configuration.md) - All config options
- [Provider Setup](./providers.md) - Detailed provider guides
- [API Reference](./api-reference.md) - tRPC and WebSocket APIs
- [Deployment Guide](./deployment.md) - Kubernetes, Docker, Coolify

### Deploy to Production

1. [Kubernetes Deployment](./deployment.md#kubernetes)
2. [Docker Deployment](./deployment.md#docker)
3. [Coolify Deployment](./deployment.md#coolify)

### Get Involved

- [Contributing Guide](../CONTRIBUTING.md)
- [GitHub Discussions](https://github.com/dxheroes/ado/discussions)
- [Report Issues](https://github.com/dxheroes/ado/issues)

---

## Summary

You've learned how to:

✅ Install ADO and AI coding agents
✅ Authenticate and configure providers
✅ Execute tasks with ADO
✅ Configure subscription-first routing
✅ Work with multiple providers and failover
✅ Create and run workflows
✅ Monitor tasks with web dashboard
✅ Set up notifications

**You're now ready to use ADO for production development!**

Need help? Check the [Troubleshooting Guide](./TROUBLESHOOTING.md) or [ask a question](https://github.com/dxheroes/ado/discussions).

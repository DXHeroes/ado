# Quick Start - Get Running in 5 Minutes

Get ADO up and running in 5 simple steps.

## Prerequisites

- Node.js 22+ installed
- pnpm or npm installed
- At least one AI coding agent installed (we'll use Claude Code)

## Step 1: Install Claude Code (2 minutes)

```bash
# Install Claude Code CLI
npm install -g @anthropic-ai/claude-code

# Authenticate with your Anthropic account
claude login
```

💡 **Tip**: If you have Claude MAX subscription, ADO will automatically use it before falling back to API calls.

## Step 2: Install ADO (1 minute)

```bash
# Install ADO globally
pnpm install -g @dxheroes/ado

# Or use npm
npm install -g @dxheroes/ado

# Verify installation
ado --version
```

## Step 3: Initialize Your Project (1 minute)

```bash
# Navigate to your project
cd your-project

# Initialize ADO
ado init

# This creates:
# - ado.config.yaml (configuration)
# - CLAUDE.md (AI agent context)
# - .ado/ (state directory)
```

## Step 4: Configure (30 seconds)

The default configuration is ready to use! But you can customize:

```yaml
# ado.config.yaml
version: "1.1"

project:
  id: "my-project"

providers:
  claude-code:
    enabled: true
    accessModes:
      - mode: subscription
        priority: 1
        enabled: true

routing:
  strategy: "subscription-first"
```

💡 **Subscription-first routing** means ADO uses your Claude MAX subscription before API calls.

## Step 5: Run Your First Task (30 seconds)

```bash
# Execute a simple task
ado run "Add a function to calculate factorial"

# Check status
ado status

# View the web dashboard
ado dashboard
```

## What Just Happened?

1. **ADO** received your task prompt
2. **Router** selected Claude Code (subscription mode, priority 1)
3. **Adapter** executed the task using Claude Code CLI
4. **State** persisted execution history in `.ado/state.db`
5. **Output** showed progress and results in real-time

## Next Steps

### Add More Providers

```bash
# Install Gemini CLI
npm install -g @google/gemini-cli
gemini auth
```

Then enable in `ado.config.yaml`:

```yaml
providers:
  gemini-cli:
    enabled: true
    accessModes:
      - mode: subscription
        priority: 2
```

### Enable Notifications

```bash
# Test Slack notifications
export SLACK_WEBHOOK_URL="https://hooks.slack.com/..."
ado notify slack
```

### Try Workflows

Create `workflow.yaml`:

```yaml
version: "1.0"
name: "Feature Development"
tasks:
  - id: "spec"
    prompt: "Write a specification for user authentication"
  - id: "implement"
    prompt: "Implement the authentication system"
    dependsOn: ["spec"]
  - id: "test"
    prompt: "Write tests for authentication"
    dependsOn: ["implement"]
```

Run it:

```bash
ado workflow run workflow.yaml
```

## Common Issues

### Command Not Found

```bash
# Check npm global bin path
npm config get prefix

# Add to PATH
export PATH="$PATH:$(npm config get prefix)/bin"
```

### Provider Not Available

```bash
# Verify Claude Code installation
claude --version

# Re-authenticate
claude login

# Check ADO status
ado status
```

### Rate Limit Hit

ADO automatically switches to the next available provider. You'll see:

```
⚠️  Rate limit detected for claude-code (subscription)
✓  Switched to gemini-cli (subscription)
```

## Examples

### Simple Code Generation

```bash
ado run "Create a REST API endpoint for user registration"
```

### Bug Fix

```bash
ado run "Fix the null pointer exception in UserService.java:42"
```

### Refactoring

```bash
ado run "Refactor the authentication module to use dependency injection"
```

### Documentation

```bash
ado run "Add JSDoc comments to all public functions in src/utils/"
```

## Learn More

- [Getting Started Guide](./GETTING_STARTED.md) - Detailed walkthrough
- [Configuration Reference](./configuration.md) - All config options
- [Providers Setup](./providers.md) - Configure all supported agents
- [Troubleshooting](./TROUBLESHOOTING.md) - Common problems and solutions

## Architecture Overview

```
Your Prompt
    ↓
ADO CLI (ado run)
    ↓
Task Router (subscription-first)
    ↓
Provider Adapter (Claude, Gemini, etc.)
    ↓
AI Agent Execution
    ↓
Result + State Persistence
```

## Key Concepts

### Subscription-First Routing
ADO prioritizes subscription-based access (Claude MAX, Cursor Pro) before API billing to maximize value.

### Provider Adapters
Unified interface for different AI agents (Claude Code, Gemini, Cursor, Copilot).

### State Persistence
All task history stored in SQLite (local) or PostgreSQL (Kubernetes).

### Automatic Failover
If a provider hits rate limits, ADO automatically switches to the next available provider.

---

**You're ready!** Start building with ADO.

Need help? Check the [Troubleshooting Guide](./TROUBLESHOOTING.md) or [open an issue](https://github.com/dxheroes/ado/issues).

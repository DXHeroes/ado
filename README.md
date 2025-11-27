# ADO - Agentic Development Orchestrator

<p align="center">
  <strong>Unified AI coding agent orchestration with subscription-first routing</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#commands">Commands</a>
</p>

---

## Overview

ADO (Agentic Development Orchestrator) is a TypeScript CLI tool that orchestrates multiple AI coding agents (Claude Code, Gemini CLI, Cursor CLI, GitHub Copilot, Codex) behind a unified interface.

**Key Innovation:** Subscription-first routing prioritizes subscription-based access (Claude MAX, Cursor Pro, etc.) over API billing to maximize value from existing subscriptions.

## Features

- 🎯 **Unified Interface** - Single CLI for multiple AI coding agents
- 💰 **Subscription-First** - Maximize subscription value before API fallback
- 🔄 **Automatic Failover** - Seamless switching when rate limits hit
- 📊 **Usage Tracking** - Monitor costs and usage across providers
- 💾 **State Persistence** - Resume sessions, track history
- 🎨 **Beautiful CLI** - Interactive prompts and colorful output
- 🌐 **Web Dashboard** - Real-time task monitoring and analytics
- 📬 **Notifications** - Slack and email alerts for task events
- 🔍 **Observability** - OpenTelemetry integration for tracing and metrics
- ☸️ **Kubernetes Ready** - Deploy locally or on K8s with same interface

## Installation

```bash
# Install globally
npm install -g @dxheroes/ado

# Or use with npx
npx @dxheroes/ado init
```

### Prerequisites

- Node.js 22+
- At least one AI coding agent installed:
  - [Claude Code](https://claude.ai/code) - `npm install -g @anthropic-ai/claude-code`

## Quick Start

```bash
# Initialize ADO in your project
ado init

# Run a task
ado run "Implement user authentication with JWT"

# Check status
ado status

# Configure providers
ado config providers
```

## Configuration

ADO uses a YAML configuration file (`ado.config.yaml`) in your project root:

```yaml
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
        subscription:
          plan: "max"
          rateLimits:
            requestsPerDay: 500

routing:
  strategy: "subscription-first"
  apiFallback:
    enabled: false
```

See `ado.config.example.yaml` for a complete configuration reference.

## Commands

### `ado init`

Initialize ADO in your project. Creates:
- `ado.config.yaml` - Main configuration
- `CLAUDE.md` - Context file for Claude
- `.ado/` - State directory

```bash
ado init              # Interactive mode
ado init -y           # Accept defaults
ado init -f           # Overwrite existing
```

### `ado run <prompt>`

Execute a task with AI agents.

```bash
# Basic usage
ado run "Fix the login bug"

# Specify provider
ado run "Add unit tests" --provider claude-code

# Resume session
ado run "Continue from where we left off" --resume <session-id>

# With options
ado run "Refactor auth module" --max-turns 30 --model claude-sonnet-4-20250514
```

### `ado status`

Show current ADO status including:
- Provider availability
- Recent tasks
- Today's usage

```bash
ado status            # Pretty output
ado status --json     # JSON output
```

### `ado config`

Manage configuration.

```bash
ado config providers  # Interactive provider configuration
ado config show       # Display current configuration
ado config set <key> <value>  # Set a configuration value
```

## Subscription-First Routing

ADO's key innovation is prioritizing subscription-based access:

```
Task → Enabled Providers → Check Capabilities
                              ↓
                    Sort by Access Priority
                              ↓
              Subscription (1) → API Fallback (10)
                              ↓
                    Check Rate Limits
                              ↓
              Available? → Execute Task
                    ↓
              Limited? → Try Next Provider
```

This ensures you get maximum value from subscriptions like Claude MAX before falling back to pay-per-token APIs.

## Context Files

ADO uses context files to provide project information to AI agents:

- `CLAUDE.md` - Context for Claude Code
- `GEMINI.md` - Context for Gemini CLI
- `.cursorrules` - Context for Cursor
- `.github/copilot-instructions.md` - Context for Copilot

These files are automatically created during `ado init` and can be customized.

## Development

```bash
# Clone repository
git clone https://github.com/dxheroes/ado
cd ado

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

## Project Structure

```
ado/
├── packages/
│   ├── shared/      # Shared types and utilities
│   ├── core/        # Core orchestration engine
│   │   ├── src/
│   │   │   ├── provider/       # Provider management
│   │   │   ├── orchestrator/   # Task orchestration
│   │   │   ├── notifications/  # Slack/Email notifications
│   │   │   ├── telemetry/      # OpenTelemetry integration
│   │   │   ├── cost/           # Cost tracking
│   │   │   ├── rate-limit/     # Rate limit detection
│   │   │   └── state/          # State persistence
│   ├── adapters/    # Agent adapters (Claude, Gemini, Cursor, etc.)
│   ├── cli/         # CLI application
│   └── dashboard/   # Web dashboard (React + Tailwind)
├── docs/            # Comprehensive documentation
├── ado.config.yaml  # Example configuration
└── README.md
```

## Documentation

- [Installation Guide](./docs/installation.md)
- [Configuration Reference](./docs/configuration.md)
- [Provider Setup](./docs/providers.md)
- [Web Dashboard](./packages/dashboard/README.md)
- [Notifications](./docs/notifications.md)
- [Telemetry & Monitoring](./packages/core/src/telemetry/README.md)
- [Kubernetes Deployment](./docs/deployment.md)
- [API Reference](./docs/api-reference.md)
- [Specification Compliance Report](./SPECIFICATION-COMPLIANCE-GAPS.md)

## Project Status

### Specification Compliance: 85%

ADO has achieved **85% compliance** with the [technical specification v1.1](./ado-specification.md):

- ✅ **Milestone 1-3:** 100% Complete (MVP, Subscription-First Routing, Multi-Agent Support)
- ⚠️ **Milestone 4:** 75% Complete (Orchestration Core - HITL integration pending)
- ⚠️ **Milestone 5:** 10% Complete (Kubernetes Deployment - in progress)
- ⚠️ **Milestone 6:** 60% Complete (Production Polish - dashboard integration pending)

### Test Coverage

- **109 passing tests** across 10 test suites
- Core business logic: Excellent coverage (provider registry, router, rate limits, cost tracking)
- Integration layer: Limited coverage (CLI commands, adapters need tests)
- See [SPECIFICATION-COMPLIANCE-GAPS.md](./SPECIFICATION-COMPLIANCE-GAPS.md) for detailed gap analysis

### Production Readiness: 75%

**Ready for:**
- ✅ Single-user local development
- ✅ Team development with shared configuration
- ✅ CI/CD integration via CLI

**Pending for enterprise:**
- ⚠️ HITL approval workflows (interface exists, integration pending)
- ⚠️ Kubernetes deployment (Helm charts in progress)
- ⚠️ Multi-tenancy and RBAC (future milestone)

See [SPECIFICATION-COMPLIANCE-GAPS.md](./SPECIFICATION-COMPLIANCE-GAPS.md) for the full compliance review and remediation plan.

## License

MIT © DX Heroes

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting a PR.


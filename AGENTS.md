# AGENTS.md - ADO Project Context

## General Instructions

- Use subagents for complex research and planning tasks
- Use context7 MCP server to get documentation for libraries
- Refer to this AGENTS.md for project structure and conventions

## Project Overview

**Agentic Development Orchestrator (ADO)** is a TypeScript CLI tool that orchestrates multiple AI coding agents (Claude Code, Gemini CLI, Cursor CLI, GitHub Copilot, Codex) behind a unified interface with advanced autonomous workflow capabilities.

## Key Innovation

**Subscription-First Routing**: The system prioritizes subscription-based access (Claude MAX, Cursor Pro, etc.) over API billing to maximize value from existing subscriptions before falling back to pay-per-token APIs.

## Current State

- **Phase**: Production-ready (M1-M6 complete), M7-M9 in progress
- **Next Step**: Deployment and production testing
- **Primary Documents**:
  - `./spec/README.md` - Specification v2.1.0 (67 documents)
  - `./README.md` - Project README
  - `./SPECIFICATION-COMPLIANCE-GAPS.md` - Compliance report

### Milestone Status

- ✅ **M1-M3**: MVP Complete (100%)
  - Project scaffolding, CLI framework, Provider registry
  - Subscription-first routing, Multi-agent support
- ✅ **M5**: Kubernetes Deployment (100%)
  - Docker images, Helm charts, K8s manifests
- ✅ **M6**: Production Polish (100%)
  - Web dashboard (React 18), Notifications (Slack, Email, Webhooks)
  - OpenTelemetry integration, Distributed tracing
- 🚧 **M7**: Distributed Control (Specification complete)
  - tRPC + WebSocket API, Remote worker management
  - PostgreSQL state sync, K8s worker spawning
- 🚧 **M8**: Autonomous Workflow (Specification complete)
  - Task decomposition, Doc-first pipeline, HITL checkpoints
  - Quality validation, Auto-fix engine
- 🚧 **M9**: Cloud Parallelization (Specification complete)
  - Parallel scheduler, Git worktree isolation
  - Cost-aware load balancing, AI-powered merging

## Technology Stack

### Core
- **Language**: TypeScript 5.x with strict mode (`exactOptionalPropertyTypes`)
- **Runtime**: Node.js 22 LTS
- **Package Manager**: pnpm 9.x (use `pnpm` not `npm`)
- **Bundler**: tsup (esbuild-based)
- **Linter/Formatter**: Biome (not ESLint/Prettier)
- **Testing**: Vitest
- **CLI Framework**: Commander.js + @clack/prompts

### API & Communication
- **tRPC**: Type-safe RPC API
- **WebSocket**: Real-time subscriptions (M7)
- **REST**: HTTP endpoints where needed

### Frontend (Dashboard)
- **React**: 18.x
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **State Management**: TanStack Query (React Query)
- **Charts**: Recharts

### Database
- **SQLite**: Local development, single-user mode
- **PostgreSQL**: Kubernetes deployment, distributed state (M7)
- **Redis**: Rate limiting, caching (planned)

### Infrastructure
- **Docker**: Container images
- **Kubernetes**: Orchestration, auto-scaling
- **Helm**: Package management
- **Coolify**: Alternative deployment platform

### LLM & AI (Planned - M7-M9)
- **LiteLLM**: Multi-provider routing (100+ providers)
- **Temporal.io**: Durable workflow engine
- **PR-Agent/Qodo Merge**: Automated code review

### Security (Planned - DEF.3)
- **Firecracker**: MicroVM sandboxing (125ms startup, 5MB overhead)

### Observability
- **OpenTelemetry**: Traces, metrics, logs
- **Prometheus**: Metrics collection
- **Jaeger/Tempo**: Distributed tracing backend

## Project Structure

```
ado/
├── packages/
│   ├── core/           # Orchestrator (21 modules, ~21K LoC)
│   │   ├── src/
│   │   │   ├── autonomous/      # Task decomposition, spec generation, HITL
│   │   │   ├── parallel/        # Parallel execution, worker pools, cost optimization
│   │   │   ├── workflow/        # Workflow engine, Temporal.io integration
│   │   │   ├── worker/          # Worker management, K8s spawning, Firecracker
│   │   │   ├── llm/             # LiteLLM router (100+ providers)
│   │   │   ├── orchestrator/    # Core orchestration engine
│   │   │   ├── provider/        # Provider management
│   │   │   ├── notifications/   # Slack/Email/Webhook notifications
│   │   │   ├── telemetry/       # OpenTelemetry integration
│   │   │   ├── deployment/      # Context switching (local/K8s)
│   │   │   ├── cost/            # Cost tracking
│   │   │   ├── rate-limit/      # Rate limit detection
│   │   │   ├── state/           # State persistence (SQLite/PostgreSQL)
│   │   │   ├── config/          # Configuration management
│   │   │   ├── context/         # Project context
│   │   │   ├── execution/       # Worktree execution
│   │   │   ├── hitl/            # Human-in-the-loop
│   │   │   ├── queue/           # Task queue
│   │   │   ├── checkpoint/      # Checkpoint management
│   │   │   └── streaming/       # Progress streaming
│   ├── cli/            # CLI application
│   ├── adapters/       # Agent adapters (Claude, Gemini, Cursor, etc.)
│   ├── shared/         # Shared types and utilities
│   ├── dashboard/      # React web dashboard
│   ├── api/            # tRPC API server
│   └── mcp-server/     # Model Context Protocol server
├── deploy/             # Kubernetes manifests, Helm charts
├── spec/               # Specification (67 documents, v2.1.0)
├── docs/               # Comprehensive documentation
├── ado.config.yaml     # Example configuration
├── package.json        # Root package.json (pnpm workspace)
├── pnpm-workspace.yaml
├── biome.json
└── tsconfig.json
```

## Core Modules (packages/core/src/)

### Autonomous (16 files, ~160KB)
- **Task Classification & Decomposition**
  - `task-classifier.ts` - Classifies tasks by type, priority, complexity
  - `task-decomposer.ts` - Breaks tasks into subtasks with checkpoints
  - `dependency-graph.ts` - DAG generation for parallel execution

- **Specification & Planning**
  - `spec-generator.ts` - Generates feature specifications from prompts
  - `spec-templates.ts` - Templates for features, bugfixes, refactoring, ADRs
  - `doc-first-workflow.ts` - /specify → /plan → /tasks → /implement workflow

- **Quality & Auto-Fix**
  - `quality-validator.ts` - Aggregates validation results
  - `typescript-validator.ts` - TypeScript-specific validation
  - `quality-validation-coordinator.ts` - Centralized validation
  - `auto-fix-engine.ts` - Automatic error fixing

- **Human-In-The-Loop (HITL)**
  - `hitl-checkpoint-coordinator.ts` - HITL checkpoint management

- **Recovery & Escalation**
  - `stuck-detector.ts` - Detects stuck tasks
  - `escalation-engine.ts` - Automatic escalation
  - `recovery-manager.ts` - Task recovery from failures

- **PR-Agent Integration (DEF.4)**
  - `pr-agent-integration.ts` - Qodo Merge integration
    - /describe, /review, /improve, /update_changelog
    - Auto-approval, security file detection, learning mode

### Parallel (8 files, ~90KB)
- `parallel-scheduler.ts` - DAG-based parallel execution
- `work-stealing-scheduler.ts` - LIFO work stealing, load balancing
- `dynamic-worker-pool.ts` - Auto-scaling worker pool
- `k8s-autoscaler.ts` - Kubernetes HPA management
- `cost-aware-load-balancer.ts` - Cost-optimized task routing
- `cost-optimizer.ts` - Cost forecasting and recommendations
- `merge-coordinator.ts` - AI-powered merge (80%+ auto-resolution)

### Workflow (5 files, ~40KB)
- `temporal-engine.ts` - **Temporal.io integration** (DEF.2)
  - Durable execution, automatic retry for LLM calls
  - Signal-based HITL, checkpoint persistence
- `workflow-engine.ts` - Base workflow engine
- `expression-evaluator.ts` - Condition evaluation

### Worker (7 files, ~30KB)
- `worker-protocol.ts` - Message protocol (registration, assignment, progress)
- `worker-registry.ts` - In-memory registry
- `postgresql-worker-registry.ts` - Persistent registry
- `k8s-worker-spawner.ts` - Dynamic K8s pod spawning
- `worker-health-monitor.ts` - Heartbeat & health checks
- `firecracker-sandbox.ts` - **Firecracker microVMs** (DEF.3)
  - 125ms startup, 5MB overhead, full kernel isolation

### LLM (1 file, ~20KB)
- `litellm-router.ts` - **LiteLLM Router** (DEF.1)
  - 100+ LLM providers, fallback chains
  - Cost tracking, load balancing, automatic failover
  - OpenTelemetry observability

### Other Modules
- **Orchestrator** - Main orchestration engine
- **State** - SQLite/PostgreSQL persistence
- **Telemetry** - OpenTelemetry integration
- **Notifications** - Slack, Email, Webhooks
- **Deployment** - Local/K8s context switching
- **Config, Cost, Execution, Queue, Checkpoint, HITL, Rate-limit, Streaming**

## Coding Standards

1. **Use Biome** for linting and formatting (not ESLint)
2. **Strict TypeScript** - no `any` types unless absolutely necessary
   - Enable `exactOptionalPropertyTypes` - use explicit `| undefined` for optional properties
3. **Functional patterns** - prefer pure functions, minimize classes
4. **Error handling** - use Result types or explicit error returns
5. **Documentation** - JSDoc for public APIs
6. **Testing** - unit tests for core logic, integration tests for adapters
7. **Naming**:
   - Prefix unused parameters with underscore (`_param`)
   - Use descriptive names for all functions and variables
8. **Imports**:
   - Use `.js` extensions for relative imports (required for ESM)
   - Never use barrel exports that could cause circular dependencies

## Key Interfaces

### ProviderConfig
```typescript
interface ProviderConfig {
  id: string;
  enabled: boolean;
  accessModes: AccessModeConfig[];
  capabilities: AgentCapabilities;
  contextFile?: string | undefined;
}
```

### AgentAdapter
```typescript
interface AgentAdapter {
  readonly id: string;
  readonly capabilities: AgentCapabilities;
  initialize(config: AgentConfig): Promise<void>;
  isAvailable(): Promise<boolean>;
  execute(task: AgentTask): AsyncIterable<AgentEvent>;
  interrupt(): Promise<void>;
  getRateLimitDetector(): RateLimitDetector;
}
```

## CLI Commands

```bash
# Task execution
ado run <prompt>
ado status

# Workflow management
ado workflow run <file>
ado workflow list
ado workflow validate <file>

# Configuration
ado config show
ado config set <key> <value>

# Dashboard
ado dashboard

# Notifications
ado notify <channel>

# Reports
ado report
```

## Key Innovations

1. **Subscription-First Routing** - Prioritizes subscription access before API billing
2. **Doc-First Workflow** - /specify → /plan → /tasks → /implement
3. **HITL Checkpoints** - 5 iterations / 30 min thresholds for escalation
4. **AI-Powered Merging** - 80%+ automatic conflict resolution
5. **Cost Optimization** - Multi-strategy load balancing (minimize-cost, balanced, maximize-performance)
6. **Firecracker Isolation** - 125ms startup, 5MB overhead for secure code execution

## Testing Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm test             # Run tests (109 passing tests)
pnpm lint             # Run Biome
pnpm typecheck        # TypeScript check
```

## Deployment

### Local Development
```bash
pnpm install
pnpm build
pnpm --filter @dxheroes/ado-cli dev
```

### Kubernetes
```bash
helm install ado ./deploy/helm/ado
```

### Docker Compose
```bash
docker-compose up -d
```

## Important Notes

- **Never use npm** - always use pnpm
- **Never use ESLint** - use Biome
- **Focus on DevEx** - CLI should be fast (<500ms startup), beautiful output
- **Subscription-first** - always check subscription limits before API fallback
- **TypeScript strict mode** - Handle all error cases explicitly
- **Build before commit** - Always run `pnpm build` to verify no type errors

## Current Task

The project is production-ready (M1-M6 complete). Current focus:
- Deployment testing and production monitoring
- Documentation updates
- M7-M9 implementation planning (specifications complete)

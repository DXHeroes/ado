# @dxheroes/ado-core

Core orchestration engine for ADO (Agentic Development Orchestrator).

## Features

- **Autonomous Workflow** - Task decomposition, spec generation, quality validation
- **Parallel Execution** - DAG-based scheduling, worker pool, cost optimization
- **Distributed Control** - Worker management, K8s integration, state sync
- **LLM Routing** - 100+ providers via LiteLLM
- **Durable Workflows** - Temporal.io integration (planned)
- **Security** - Firecracker sandboxing (planned)

## Installation

```bash
pnpm add @dxheroes/ado-core
```

## Modules (21 Total)

### Autonomous (`/autonomous/`) - 16 files

**Task Classification & Decomposition**
- `TaskClassifier` - Classifies tasks by type, priority, complexity
- `TaskDecomposer` - Breaks tasks into subtasks with checkpoints
- `DependencyGraph` - DAG generation for parallel execution

**Specification & Planning**
- `SpecGenerator` - Generates feature specifications from prompts
- `SpecTemplates` - Templates for features, bugfixes, refactoring, ADRs
- `DocFirstWorkflow` - /specify → /plan → /tasks → /implement workflow

**Quality & Auto-Fix**
- `QualityValidator` - Aggregates validation results
- `TypeScriptValidator` - TypeScript-specific validation
- `QualityValidationCoordinator` - Centralized validation
- `AutoFixEngine` - Automatic error fixing with stuck detection

**Human-In-The-Loop (HITL)**
- `HITLCheckpointCoordinator` - HITL checkpoint management
  - 5 iterations threshold → escalate
  - 30 minutes timeout → escalate

**Recovery & Escalation**
- `StuckDetector` - Detects stuck tasks
- `EscalationEngine` - Automatic escalation
- `RecoveryManager` - Task recovery from failures

**PR-Agent Integration (DEF.4)**
- `PRAgent` - Qodo Merge integration
  - /describe, /review, /improve, /update_changelog
  - Auto-approval, security file detection, learning mode

### Parallel (`/parallel/`) - 8 files

- `ParallelScheduler` - DAG-based parallel task execution
- `WorkStealingScheduler` - LIFO work stealing, load balancing
- `DynamicWorkerPool` - Auto-scaling worker pool
- `K8sAutoscaler` - Kubernetes HPA management
- `CostAwareLoadBalancer` - Cost-optimized task routing
  - Strategies: minimize-cost, balanced, maximize-performance
- `CostOptimizer` - Cost forecasting and recommendations
- `MergeCoordinator` - AI-powered merge (80%+ auto-resolution)
- `GitWorktreeManager` - Git worktree isolation per worker

### Workflow (`/workflow/`) - 5 files

- `TemporalWorkflowEngine` - Temporal.io integration (DEF.2)
  - Durable execution, automatic retry for LLM calls
  - Signal-based HITL, checkpoint persistence
- `WorkflowEngine` - Base workflow engine
- `WorkflowState` - State management
- `ExpressionEvaluator` - Condition evaluation
- `WorkflowValidator` - Workflow validation

### Worker (`/worker/`) - 7 files

- `WorkerProtocol` - Message protocol (registration, assignment, progress)
- `WorkerRegistry` - In-memory worker registry
- `PostgreSQLWorkerRegistry` - Persistent registry
- `K8sWorkerSpawner` - Dynamic K8s pod spawning
- `WorkerHealthMonitor` - Heartbeat & health checks
- `FirecrackerSandbox` - Firecracker microVMs (DEF.3)
  - 125ms startup, 5MB overhead, full kernel isolation
- `WorkerManager` - Worker lifecycle management

### LLM (`/llm/`) - 1 file

- `LiteLLMRouter` - LiteLLM Router (DEF.1)
  - 100+ LLM providers, fallback chains
  - Cost tracking, load balancing, automatic failover
  - OpenTelemetry observability

### Other Core Modules

- **Orchestrator** - Main orchestration engine
- **State** - SQLite/PostgreSQL persistence
- **Telemetry** - OpenTelemetry integration
- **Notifications** - Slack, Email, Webhooks
- **Deployment** - Local/K8s context switching
- **Config** - Configuration management
- **Cost** - Cost tracking
- **Execution** - Worktree execution
- **Queue** - Task queue
- **Checkpoint** - Checkpoint management
- **HITL** - Human-in-the-loop
- **Rate-limit** - Rate limit detection
- **Streaming** - Progress streaming

## Usage

### Basic Orchestration

```typescript
import { createOrchestrator } from '@dxheroes/ado-core';

const orchestrator = createOrchestrator({
  providers: [
    {
      id: 'claude-code',
      enabled: true,
      accessModes: [
        {
          mode: 'subscription',
          priority: 1,
          enabled: true,
        }
      ],
    }
  ],
  enableCheckpoints: true,
});

// Execute task
for await (const event of orchestrator.executeTask({
  prompt: 'Build user authentication feature'
})) {
  console.log(event);
}
```

### Autonomous Workflow

```typescript
import { createDocFirstWorkflow } from '@dxheroes/ado-core/autonomous';

const workflow = createDocFirstWorkflow({
  orchestrator,
  enableHITL: true,
  qualityGates: {
    coverage: 80,
    buildRequired: true,
    testRequired: true,
  }
});

// Run doc-first workflow
const result = await workflow.execute({
  prompt: 'Add JWT authentication',
  phases: ['specify', 'plan', 'tasks', 'implement'],
});
```

### Parallel Execution

```typescript
import { createParallelScheduler } from '@dxheroes/ado-core/parallel';

const scheduler = createParallelScheduler({
  maxWorkers: 5,
  costStrategy: 'minimize-cost', // or 'balanced', 'maximize-performance'
  enableWorktreeIsolation: true,
});

// Execute tasks in parallel
await scheduler.executeTasks([
  { id: 'task-1', prompt: 'Add user model' },
  { id: 'task-2', prompt: 'Add auth controller' },
  { id: 'task-3', prompt: 'Add JWT middleware' },
]);
```

### Worker Management

```typescript
import { createK8sWorkerSpawner } from '@dxheroes/ado-core/worker';

const spawner = createK8sWorkerSpawner({
  namespace: 'ado-workers',
  image: 'dxheroes/ado-worker:latest',
  maxWorkers: 10,
});

// Spawn remote worker
const worker = await spawner.spawn({
  providerId: 'claude-code',
  capabilities: ['code-generation', 'testing'],
});
```

### Quality Validation

```typescript
import { createQualityValidationCoordinator } from '@dxheroes/ado-core/autonomous';

const validator = createQualityValidationCoordinator({
  languages: ['typescript', 'python', 'go'],
  gates: {
    build: true,
    test: true,
    lint: true,
    coverage: 80,
  }
});

// Validate implementation
const report = await validator.validate({
  taskId: 'task-123',
  files: ['src/auth.ts', 'tests/auth.test.ts'],
});

if (!report.passed) {
  console.error('Validation failed:', report.issues);
}
```

## Architecture

### Subscription-First Routing

The core innovation of ADO is subscription-first routing:

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

### State Management

- **Local Development**: SQLite database
- **Kubernetes Deployment**: PostgreSQL with distributed state sync
- **Redis**: Rate limiting and caching (planned)

### Observability

All modules integrate with OpenTelemetry:
- Distributed tracing across providers
- Metrics collection (task duration, success rate, cost)
- Structured logging with correlation IDs

## Configuration

The core module is configured via `ado.config.yaml`:

```yaml
version: "1.1"

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

checkpoints:
  enabled: true
  autoSave: true
  escalationThresholds:
    maxIterations: 5
    maxDuration: 1800000  # 30 minutes

parallelization:
  enabled: false
  maxWorkers: 5
  costStrategy: "minimize-cost"

quality:
  gates:
    build: true
    test: true
    lint: true
    coverage: 80
```

## API Reference

For detailed API documentation, see:
- [Orchestrator API](./docs/orchestrator.md)
- [Autonomous API](./docs/autonomous.md)
- [Parallel API](./docs/parallel.md)
- [Worker API](./docs/worker.md)
- [LLM API](./docs/llm.md)

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

## License

MIT © DX Heroes

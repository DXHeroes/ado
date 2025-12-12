# Temporal.io Workflows Design

## Přehled

Architektonický design pro integraci Temporal.io jako durable workflow engine pro ADO - garantuje spolehlivost autonomního provádění úkolů s automatic retry, checkpointing a human-in-the-loop podporou.

## Proč Temporal.io?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Workflow Engine Comparison                                │
└─────────────────────────────────────────────────────────────────────────────┘

                    Manual State      BullMQ          Temporal.io
                    ────────────      ──────          ───────────
Durable Execution   No                No              Yes
Auto Retry          Manual            Basic           Advanced
State Persistence   Manual            Redis           Event-sourced
Recovery            Manual            Basic           Automatic
HITL Support        Custom            Custom          Built-in (signals)
Observability       Custom            Basic           Excellent
Production Users    -                 Many            Uber, Netflix, Stripe

Key Advantages:
- Workflows survive process crashes and restarts
- Every step persisted, replay from any point
- Native retry logic with exponential backoff
- Signals for synchronous and async HITL
- Built-in versioning for workflow updates
- Time-travel debugging
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Temporal.io Integration Architecture                      │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              ADO Orchestrator                                │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Temporal Client                                │  │
│  │                                                                        │  │
│  │  • Start workflows                                                     │  │
│  │  • Query workflow state                                                │  │
│  │  • Send signals (HITL approval, cancellation)                          │  │
│  └────────────────────────────────┬──────────────────────────────────────┘  │
│                                   │                                         │
└───────────────────────────────────┼─────────────────────────────────────────┘
                                    │ gRPC
                                    │
┌───────────────────────────────────┼─────────────────────────────────────────┐
│                          Temporal Server (self-hosted)                       │
│                                   │                                         │
│  ┌────────────────────────────────▼──────────────────────────────────────┐  │
│  │                        Workflow Service                                │  │
│  │                                                                        │  │
│  │  • Workflow orchestration                                             │  │
│  │  • Event sourcing and persistence                                     │  │
│  │  • Task scheduling and routing                                        │  │
│  └────────────────────────────────┬──────────────────────────────────────┘  │
│                                   │                                         │
│  ┌────────────────────────────────▼──────────────────────────────────────┐  │
│  │                     PostgreSQL / Cassandra                             │  │
│  │                   (Event Store + Visibility)                           │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Task Queue
                                    │
┌───────────────────────────────────┼─────────────────────────────────────────┐
│                           Temporal Workers                                   │
│                                   │                                         │
│  ┌────────────────────────────────▼──────────────────────────────────────┐  │
│  │                         Worker Pool                                    │  │
│  │                                                                        │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │  │
│  │  │ Task Worker  │  │ Code Worker  │  │Review Worker │               │  │
│  │  │              │  │              │  │              │               │  │
│  │  │ • Plan       │  │ • Generate   │  │ • QA gates   │               │  │
│  │  │ • Decompose  │  │ • Execute    │  │ • Test       │               │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │  │
│  │                                                                        │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │                    Activity Implementations                      │  │  │
│  │  │  • LLM calls via LiteLLM                                         │  │  │
│  │  │  • Code execution in Firecracker sandbox                         │  │  │
│  │  │  • Git operations (commit, push, PR)                             │  │  │
│  │  │  • Quality gates (lint, test, build)                             │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Workflow Definitions

### Task Execution Workflow

```typescript
// packages/core/src/workflows/task-execution.workflow.ts
import { proxyActivities, sleep, condition } from '@temporalio/workflow';
import type * as activities from '../activities';

// Activity proxies with retry policies
const {
  planTask,
  decomposeTask,
  generateCode,
  executeCode,
  runQualityGates,
  createPullRequest,
  requestHumanApproval,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  retry: {
    initialInterval: '1s',
    backoffCoefficient: 2,
    maximumInterval: '60s',
    maximumAttempts: 3,
  },
});

export interface TaskExecutionInput {
  taskId: string;
  prompt: string;
  repository: string;
  branch: string;
  hitlEnabled: boolean;
}

export interface TaskExecutionState {
  phase: 'planning' | 'coding' | 'testing' | 'review' | 'completed' | 'failed';
  plan?: string;
  subtasks?: string[];
  attempts: number;
  errors: string[];
  checkpointId?: string;
}

/**
 * Main task execution workflow
 * Durable, survives worker restarts, automatic retry on failures
 */
export async function taskExecutionWorkflow(
  input: TaskExecutionInput
): Promise<TaskExecutionResult> {
  const state: TaskExecutionState = {
    phase: 'planning',
    attempts: 0,
    errors: [],
  };

  // ========================================================================
  // PHASE 1: Planning
  // ========================================================================
  state.phase = 'planning';

  const plan = await planTask({
    taskId: input.taskId,
    prompt: input.prompt,
    repository: input.repository,
  });

  state.plan = plan.content;
  state.checkpointId = plan.checkpointId;

  // HITL checkpoint: Approve plan?
  if (input.hitlEnabled) {
    const approved = await waitForHumanApproval('plan', plan.content);
    if (!approved) {
      throw new Error('Plan rejected by human reviewer');
    }
  }

  // ========================================================================
  // PHASE 2: Task Decomposition
  // ========================================================================
  const subtasks = await decomposeTask({
    taskId: input.taskId,
    plan: plan.content,
  });

  state.subtasks = subtasks.map(st => st.id);

  // ========================================================================
  // PHASE 3: Code Generation & Iteration
  // ========================================================================
  state.phase = 'coding';

  let codeIteration = 0;
  const maxIterations = 10;
  let qualityGatesPassed = false;

  while (!qualityGatesPassed && codeIteration < maxIterations) {
    codeIteration++;
    state.attempts = codeIteration;

    // Generate code
    const codeResult = await generateCode({
      taskId: input.taskId,
      plan: plan.content,
      previousErrors: state.errors,
      iteration: codeIteration,
    });

    // Execute code in sandbox
    const executionResult = await executeCode({
      taskId: input.taskId,
      code: codeResult.code,
      language: codeResult.language,
    });

    if (!executionResult.success) {
      state.errors.push(executionResult.error);
      continue; // Retry code generation
    }

    // ========================================================================
    // PHASE 4: Quality Gates
    // ========================================================================
    state.phase = 'testing';

    const qaResult = await runQualityGates({
      taskId: input.taskId,
      repository: input.repository,
      branch: input.branch,
    });

    if (qaResult.passed) {
      qualityGatesPassed = true;
    } else {
      // Record structured errors for next iteration
      state.errors.push(
        ...qaResult.failures.map(f => `${f.tool}: ${f.message}`)
      );

      // Stuck detection: same error 3 times → escalate
      if (detectStuckState(state.errors)) {
        const approved = await waitForHumanApproval(
          'stuck',
          `Stuck after ${codeIteration} iterations. Continue?`
        );
        if (!approved) {
          throw new Error('Escalated to human after stuck detection');
        }
      }
    }
  }

  if (!qualityGatesPassed) {
    throw new Error(`Quality gates failed after ${maxIterations} iterations`);
  }

  // ========================================================================
  // PHASE 5: Pull Request Creation
  // ========================================================================
  state.phase = 'review';

  const pr = await createPullRequest({
    taskId: input.taskId,
    repository: input.repository,
    branch: input.branch,
    title: `[ADO] ${input.prompt}`,
    description: plan.content,
  });

  // HITL checkpoint: Approve PR merge?
  if (input.hitlEnabled) {
    const approved = await waitForHumanApproval('pr', pr.url);
    if (!approved) {
      state.phase = 'failed';
      throw new Error('PR rejected by human reviewer');
    }
  }

  // ========================================================================
  // PHASE 6: Completion
  // ========================================================================
  state.phase = 'completed';

  return {
    taskId: input.taskId,
    status: 'completed',
    pullRequestUrl: pr.url,
    iterations: codeIteration,
    checkpointId: state.checkpointId,
  };
}

/**
 * Wait for human approval via signal
 * Temporal signals allow external processes to send data to running workflows
 */
async function waitForHumanApproval(
  checkpoint: string,
  context: string
): Promise<boolean> {
  // Create approval request
  await requestHumanApproval({
    checkpoint,
    context,
  });

  // Wait for signal with timeout
  const approvalReceived = await condition(
    () => humanApprovalSignal !== null,
    '30 minutes' // Timeout after 30 minutes
  );

  if (!approvalReceived) {
    throw new Error(`Human approval timeout for checkpoint: ${checkpoint}`);
  }

  return humanApprovalSignal.approved;
}

/**
 * Detect stuck state: same error 3+ times
 */
function detectStuckState(errors: string[]): boolean {
  if (errors.length < 3) return false;

  const lastThree = errors.slice(-3);
  return (
    lastThree[0] === lastThree[1] &&
    lastThree[1] === lastThree[2] &&
    lastThree[0] !== ''
  );
}
```

### Workflow Signals and Queries

```typescript
// packages/core/src/workflows/task-execution.workflow.ts (continued)
import { defineSignal, defineQuery, setHandler } from '@temporalio/workflow';

/**
 * Signals: External → Workflow communication
 */
export const humanApprovalSignal = defineSignal<[{ approved: boolean }]>(
  'humanApproval'
);

export const cancelTaskSignal = defineSignal('cancelTask');

/**
 * Queries: Read workflow state without side effects
 */
export const taskStateQuery = defineQuery<TaskExecutionState>('taskState');

export const checkpointStatusQuery =
  defineQuery<CheckpointStatus>('checkpointStatus');

// Register signal handlers
setHandler(humanApprovalSignal, ({ approved }) => {
  humanApprovalReceived = { approved, timestamp: Date.now() };
});

setHandler(cancelTaskSignal, () => {
  throw new Error('Task cancelled by user');
});

// Register query handlers
setHandler(taskStateQuery, () => state);

setHandler(checkpointStatusQuery, () => ({
  currentPhase: state.phase,
  attempts: state.attempts,
  lastCheckpoint: state.checkpointId,
}));
```

## Activity Implementations

### LLM Call Activity with Retry

```typescript
// packages/core/src/activities/llm.activities.ts
import { Context } from '@temporalio/activity';

export async function planTask(input: {
  taskId: string;
  prompt: string;
  repository: string;
}): Promise<{ content: string; checkpointId: string }> {
  const context = Context.current();

  // Temporal automatically retries on transient failures
  try {
    const response = await litellm.chat([
      {
        role: 'system',
        content:
          'You are a technical architect. Create a detailed implementation plan.',
      },
      { role: 'user', content: input.prompt },
    ]);

    // Heartbeat to indicate activity is alive
    context.heartbeat({ progress: 'plan_generated' });

    // Persist checkpoint
    const checkpointId = await saveCheckpoint({
      taskId: input.taskId,
      phase: 'planning',
      data: { plan: response.content },
    });

    return {
      content: response.content,
      checkpointId,
    };
  } catch (error) {
    // Temporal will retry based on retry policy
    if (error instanceof RateLimitError) {
      // Exponential backoff handled automatically
      throw error;
    }

    throw new Error(`Plan generation failed: ${error.message}`);
  }
}
```

### Code Execution Activity

```typescript
// packages/core/src/activities/sandbox.activities.ts
export async function executeCode(input: {
  taskId: string;
  code: string;
  language: Language;
}): Promise<ExecutionResult> {
  const context = Context.current();

  // Create Firecracker MicroVM
  const sandbox = await sandboxManager.create(input.taskId);

  try {
    // Heartbeat during long-running execution
    const heartbeatInterval = setInterval(() => {
      context.heartbeat({ progress: 'executing' });
    }, 5000);

    const result = await sandbox.execute(input.code, input.language);

    clearInterval(heartbeatInterval);

    return result;
  } finally {
    // Cleanup always runs
    await sandbox.terminate();
  }
}
```

### Quality Gates Activity

```typescript
// packages/core/src/activities/quality.activities.ts
export async function runQualityGates(input: {
  taskId: string;
  repository: string;
  branch: string;
}): Promise<QualityGatesResult> {
  const context = Context.current();

  // Run gates in parallel
  const results = await Promise.allSettled([
    runTypeCheck(input.repository),
    runLinter(input.repository),
    runTests(input.repository),
    runBuild(input.repository),
  ]);

  // Heartbeat with progress
  context.heartbeat({ progress: 'quality_gates_complete' });

  const failures = results
    .map((r, i) => ({
      tool: ['typecheck', 'lint', 'test', 'build'][i],
      result: r,
    }))
    .filter(({ result }) => result.status === 'rejected')
    .map(({ tool, result }) => ({
      tool,
      message: result.reason.message,
    }));

  return {
    passed: failures.length === 0,
    failures,
  };
}
```

## Human-in-the-Loop Integration

### Sending Signals from Orchestrator

```typescript
// packages/core/src/orchestrator/hitl-handler.ts
import { WorkflowClient } from '@temporalio/client';

export class HITLHandler {
  private client: WorkflowClient;

  constructor(client: WorkflowClient) {
    this.client = client;
  }

  /**
   * Send approval/rejection to workflow
   */
  async sendApproval(
    workflowId: string,
    approved: boolean
  ): Promise<void> {
    const handle = this.client.getHandle(workflowId);

    await handle.signal('humanApproval', { approved });
  }

  /**
   * Query current workflow state
   */
  async getWorkflowState(workflowId: string): Promise<TaskExecutionState> {
    const handle = this.client.getHandle(workflowId);

    return await handle.query('taskState');
  }

  /**
   * Cancel workflow
   */
  async cancelWorkflow(workflowId: string): Promise<void> {
    const handle = this.client.getHandle(workflowId);

    await handle.signal('cancelTask');
  }
}
```

### Slack Notification for HITL

```typescript
// packages/core/src/notifications/slack-hitl.ts
export async function notifyHumanApprovalRequired(
  checkpoint: string,
  context: string,
  workflowId: string
): Promise<void> {
  await slackClient.chat.postMessage({
    channel: '#ado-approvals',
    text: `🤖 ADO requires approval for ${checkpoint}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Workflow:* \`${workflowId}\`\n*Checkpoint:* ${checkpoint}\n\n${context}`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Approve ✓' },
            style: 'primary',
            value: `approve:${workflowId}`,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Reject ✗' },
            style: 'danger',
            value: `reject:${workflowId}`,
          },
        ],
      },
    ],
  });
}
```

## Checkpoint Persistence

```typescript
// packages/core/src/storage/checkpoint.service.ts
export interface Checkpoint {
  id: string;
  taskId: string;
  workflowId: string;
  phase: string;
  timestamp: Date;
  data: Record<string, any>;
}

export class CheckpointService {
  /**
   * Save checkpoint to PostgreSQL
   */
  async save(checkpoint: Omit<Checkpoint, 'id'>): Promise<string> {
    const result = await db.checkpoint.create({
      data: {
        taskId: checkpoint.taskId,
        workflowId: checkpoint.workflowId,
        phase: checkpoint.phase,
        timestamp: checkpoint.timestamp,
        data: checkpoint.data,
      },
    });

    return result.id;
  }

  /**
   * Restore workflow from checkpoint
   */
  async restore(checkpointId: string): Promise<Checkpoint> {
    return await db.checkpoint.findUnique({
      where: { id: checkpointId },
    });
  }

  /**
   * Get latest checkpoint for task
   */
  async getLatest(taskId: string): Promise<Checkpoint | null> {
    return await db.checkpoint.findFirst({
      where: { taskId },
      orderBy: { timestamp: 'desc' },
    });
  }
}
```

## Workflow Recovery

```typescript
// packages/core/src/workflows/recovery.ts
export class WorkflowRecovery {
  private client: WorkflowClient;

  /**
   * Resume workflow from last checkpoint
   */
  async resumeFromCheckpoint(taskId: string): Promise<void> {
    const checkpoint = await checkpointService.getLatest(taskId);

    if (!checkpoint) {
      throw new Error(`No checkpoint found for task ${taskId}`);
    }

    // Temporal automatically resumes from event history
    const handle = this.client.getHandle(checkpoint.workflowId);

    const state = await handle.query('taskState');
    console.log(
      `Resuming workflow ${checkpoint.workflowId} from phase: ${state.phase}`
    );

    // Workflow continues from where it left off
    // No manual state restoration needed - Temporal handles it via event sourcing
  }

  /**
   * Restart workflow with new version (safe migration)
   */
  async migrateWorkflow(
    oldWorkflowId: string,
    newWorkflowVersion: string
  ): Promise<string> {
    const oldHandle = this.client.getHandle(oldWorkflowId);
    const state = await oldHandle.query('taskState');

    // Cancel old workflow
    await oldHandle.cancel();

    // Start new workflow with migrated state
    const newHandle = await this.client.start(taskExecutionWorkflow, {
      taskQueue: 'ado-tasks',
      workflowId: `${oldWorkflowId}-migrated`,
      // Temporal workflow versioning ensures backward compatibility
      searchAttributes: {
        WorkflowVersion: [newWorkflowVersion],
      },
    });

    return newHandle.workflowId;
  }
}
```

## Configuration

### Temporal Server Setup

```yaml
# docker-compose.temporal.yaml
services:
  temporal:
    image: temporalio/auto-setup:1.24.2
    environment:
      - DB=postgresql
      - DB_PORT=5432
      - POSTGRES_USER=temporal
      - POSTGRES_PWD=temporal
      - POSTGRES_SEEDS=postgres
    ports:
      - 7233:7233  # gRPC
      - 8233:8233  # Web UI
    depends_on:
      - postgres

  temporal-ui:
    image: temporalio/ui:2.26.2
    environment:
      - TEMPORAL_ADDRESS=temporal:7233
    ports:
      - 8080:8080

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: temporal
      POSTGRES_PASSWORD: temporal
```

### Worker Configuration

```typescript
// packages/core/src/workers/temporal-worker.ts
import { Worker } from '@temporalio/worker';
import * as activities from '../activities';

async function runWorker() {
  const worker = await Worker.create({
    workflowsPath: require.resolve('../workflows'),
    activities,
    taskQueue: 'ado-tasks',
    maxConcurrentActivityExecutions: 10,
    maxConcurrentWorkflowTaskExecutions: 100,
  });

  await worker.run();
}

runWorker().catch(err => {
  console.error('Worker failed', err);
  process.exit(1);
});
```

## Observability

### Temporal Web UI

```
http://localhost:8080

Features:
- Workflow execution history (event sourcing)
- Time-travel debugging
- Activity retry visualization
- Signal/Query inspection
- Workflow versioning
```

### Metrics Export

```typescript
// packages/core/src/telemetry/temporal-metrics.ts
import { PrometheusMetricsExporter } from '@temporalio/worker';

const metricsExporter = new PrometheusMetricsExporter({
  port: 9090,
  prefix: 'ado_temporal_',
});

// Metrics exported:
// - ado_temporal_workflow_completed_total
// - ado_temporal_workflow_failed_total
// - ado_temporal_activity_execution_latency
// - ado_temporal_workflow_task_queue_depth
```

---

## Souvislosti

- [Task Decomposition](./task-decomposition.md)
- [HITL Checkpoints](../../06-user-guide/02-core-concepts/checkpoints-hitl.md)
- [LiteLLM Routing](../01-distributed-system/litellm-routing.md)
- [NFR-003: Reliability](../../02-requirements/02-non-functional/NFR-003-reliability.md)

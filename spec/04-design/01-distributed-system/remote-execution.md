# Remote Execution

## Přehled

Design vzdáleného provádění úkolů na cloudové infrastruktuře z lokálního CLI.

## Koncepty

### Execution Modes

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Execution Modes                               │
└─────────────────────────────────────────────────────────────────────┘

1. LOCAL MODE (default)
   ┌──────────┐
   │   CLI    │ ──── executes locally ──── │ Local Agent │
   └──────────┘

2. REMOTE MODE (--remote)
   ┌──────────┐         ┌─────────────┐         ┌──────────┐
   │   CLI    │ ─tRPC─► │ API Gateway │ ─────►  │  Worker  │
   └──────────┘         └─────────────┘         │  (Cloud) │
        ▲                                        └──────────┘
        │                                              │
        └──────────── WebSocket stream ───────────────┘

3. HYBRID MODE (--hybrid)
   ┌──────────┐         ┌─────────────┐
   │   CLI    │ ─tRPC─► │ API Gateway │
   └──────────┘         └──────┬──────┘
        │                      │
        │               ┌──────┴──────┐
        │               │             │
        ▼               ▼             ▼
   ┌──────────┐    ┌──────────┐  ┌──────────┐
   │  Local   │    │ Worker 1 │  │ Worker N │
   │  Agent   │    │ (Cloud)  │  │ (Cloud)  │
   └──────────┘    └──────────┘  └──────────┘
```

## Remote Execution Flow

### 1. Task Submission

```typescript
// CLI initiates remote execution
interface RemoteExecutionRequest {
  task: {
    prompt: string;
    taskType: TaskType;
    context: TaskContext;
  };
  execution: {
    mode: 'remote' | 'hybrid';
    workers?: number;
    preferredProviders?: string[];
    maxCost?: number;
    timeout?: number;
  };
  streaming: {
    enabled: boolean;
    includeToolCalls: boolean;
    bufferSize?: number;
  };
}
```

### 2. Request Processing

```
CLI Request
     │
     ▼
┌─────────────┐
│ API Gateway │
│             │
│ 1. Auth     │
│ 2. Validate │
│ 3. Enqueue  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Redis     │
│   Queue     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│Orchestrator │
│             │
│ 1. Decompose│
│ 2. Schedule │
│ 3. Assign   │
└──────┬──────┘
       │
       ├──────────┬──────────┐
       ▼          ▼          ▼
   Worker 1   Worker 2   Worker N
```

### 3. Worker Assignment

```typescript
// packages/core/src/remote/worker-assigner.ts
export class WorkerAssigner {
  async assignTask(task: Task): Promise<WorkerAssignment> {
    // 1. Get available workers
    const workers = await this.pool.getAvailable();

    // 2. Filter by capabilities
    const capable = workers.filter(w =>
      this.hasCapabilities(w, task.requirements)
    );

    // 3. Score workers
    const scored = capable.map(w => ({
      worker: w,
      score: this.calculateScore(w, task),
    }));

    // 4. Select best
    const best = scored.sort((a, b) => b.score - a.score)[0];

    // 5. Create assignment
    return this.createAssignment(best.worker, task);
  }

  private calculateScore(worker: Worker, task: Task): number {
    let score = 0;

    // Prefer subscription-based
    if (worker.accessMode === 'subscription') {
      score += 100;
    }

    // Lower load is better
    score += (1 - worker.utilization) * 50;

    // Matching provider preference
    if (task.preferredProviders?.includes(worker.providerId)) {
      score += 30;
    }

    // Geographic proximity (if applicable)
    if (worker.region === task.preferredRegion) {
      score += 20;
    }

    return score;
  }
}
```

## Streaming Architecture

### Output Streaming

```typescript
// packages/core/src/remote/stream-manager.ts
export class StreamManager {
  private streams: Map<string, StreamConnection> = new Map();

  async createStream(taskId: string, clientId: string): Promise<Stream> {
    const stream = new StreamConnection({
      taskId,
      clientId,
      bufferSize: 1000,
      heartbeatInterval: 5000,
    });

    // Register with Redis pub/sub for scaling
    await this.redis.subscribe(`task:${taskId}:output`);

    this.streams.set(`${taskId}:${clientId}`, stream);

    return stream;
  }

  async broadcast(taskId: string, event: StreamEvent): Promise<void> {
    // Local broadcast
    for (const [key, stream] of this.streams) {
      if (key.startsWith(taskId)) {
        stream.send(event);
      }
    }

    // Cross-instance broadcast via Redis
    await this.redis.publish(
      `task:${taskId}:output`,
      JSON.stringify(event)
    );
  }
}
```

### Reconnection Handling

```typescript
// packages/cli/src/remote/reconnection.ts
export class ReconnectionManager {
  private lastEventId: string | null = null;
  private buffer: StreamEvent[] = [];

  async reconnect(taskId: string): Promise<void> {
    // 1. Reconnect WebSocket
    await this.ws.connect();

    // 2. Resume from last event
    if (this.lastEventId) {
      const missed = await trpc.stream.getMissedEvents.query({
        taskId,
        afterEventId: this.lastEventId,
      });

      // 3. Process missed events
      for (const event of missed) {
        this.handleEvent(event);
      }
    }

    // 4. Resubscribe
    this.subscribe(taskId);
  }

  handleEvent(event: StreamEvent): void {
    this.lastEventId = event.id;
    this.buffer.push(event);

    // Trim buffer
    if (this.buffer.length > 1000) {
      this.buffer = this.buffer.slice(-500);
    }

    this.emit('event', event);
  }
}
```

## Security

### Authentication Flow

```
┌──────────┐         ┌─────────────┐         ┌──────────┐
│   CLI    │         │ API Gateway │         │  Worker  │
└────┬─────┘         └──────┬──────┘         └────┬─────┘
     │                      │                     │
     │ 1. Login (API key)   │                     │
     │─────────────────────►│                     │
     │                      │                     │
     │ 2. JWT Token         │                     │
     │◄─────────────────────│                     │
     │                      │                     │
     │ 3. Request + JWT     │                     │
     │─────────────────────►│                     │
     │                      │ 4. Verify JWT       │
     │                      │ 5. Create task token│
     │                      │────────────────────►│
     │                      │                     │
     │ 6. Stream (WS + JWT) │                     │
     │◄═══════════════════════════════════════════│
     │                      │                     │
```

### Task Isolation

```typescript
// packages/worker/src/isolation/sandbox.ts
export class TaskSandbox {
  async execute(task: Task): Promise<TaskResult> {
    // 1. Create isolated environment
    const container = await this.docker.create({
      image: 'ado-worker:latest',
      memory: '4g',
      cpus: 2,
      network: 'task-network',
      volumes: [
        `${task.workspacePath}:/workspace:rw`,
      ],
      env: {
        TASK_ID: task.id,
        // No host access
        NO_HOST_NETWORK: 'true',
      },
    });

    // 2. Execute in container
    try {
      const result = await container.exec({
        command: ['ado-agent', 'execute', task.id],
        timeout: task.timeout,
      });

      return result;
    } finally {
      // 3. Cleanup
      await container.remove({ force: true });
    }
  }
}
```

## Error Handling

### Failure Scenarios

```typescript
// packages/core/src/remote/error-handler.ts
export class RemoteErrorHandler {
  async handleError(
    task: Task,
    error: RemoteExecutionError
  ): Promise<ErrorResolution> {
    switch (error.type) {
      case 'WORKER_DISCONNECTED':
        return this.handleWorkerDisconnect(task, error);

      case 'WORKER_TIMEOUT':
        return this.handleTimeout(task, error);

      case 'WORKER_CRASHED':
        return this.handleCrash(task, error);

      case 'NETWORK_ERROR':
        return this.handleNetworkError(task, error);

      case 'PROVIDER_ERROR':
        return this.handleProviderError(task, error);

      default:
        return this.handleUnknownError(task, error);
    }
  }

  private async handleWorkerDisconnect(
    task: Task,
    error: RemoteExecutionError
  ): Promise<ErrorResolution> {
    // 1. Check if task has checkpoint
    const checkpoint = await this.checkpoints.getLatest(task.id);

    if (checkpoint) {
      // 2. Reassign to new worker from checkpoint
      const newWorker = await this.assigner.assignTask(task);
      await this.resume(task, checkpoint, newWorker);

      return {
        action: 'resumed',
        fromCheckpoint: checkpoint.id,
        newWorker: newWorker.id,
      };
    }

    // 3. Retry from beginning
    return this.retry(task, error);
  }
}
```

### Retry Strategy

```typescript
// packages/core/src/remote/retry-strategy.ts
export class RetryStrategy {
  async shouldRetry(
    task: Task,
    error: Error,
    attempt: number
  ): Promise<RetryDecision> {
    const maxRetries = task.config.maxRetries ?? 3;

    if (attempt >= maxRetries) {
      return { retry: false, reason: 'max_retries_exceeded' };
    }

    // Exponential backoff
    const delay = Math.min(
      1000 * Math.pow(2, attempt),
      30000 // Max 30s
    );

    // Check if error is retryable
    if (this.isTransientError(error)) {
      return {
        retry: true,
        delay,
        strategy: 'same_worker',
      };
    }

    if (this.isWorkerError(error)) {
      return {
        retry: true,
        delay,
        strategy: 'different_worker',
      };
    }

    return { retry: false, reason: 'non_retryable_error' };
  }
}
```

## Monitoring

### Metrics

```typescript
// Remote execution metrics
const metrics = {
  // Latency
  requestLatency: new Histogram({
    name: 'ado_remote_request_latency_seconds',
    help: 'Latency of remote execution requests',
    labelNames: ['operation', 'status'],
    buckets: [0.1, 0.5, 1, 2, 5, 10],
  }),

  // Stream metrics
  streamMessages: new Counter({
    name: 'ado_remote_stream_messages_total',
    help: 'Total stream messages',
    labelNames: ['taskId', 'type'],
  }),

  // Reconnections
  reconnections: new Counter({
    name: 'ado_remote_reconnections_total',
    help: 'Total reconnection attempts',
    labelNames: ['reason', 'success'],
  }),

  // Active streams
  activeStreams: new Gauge({
    name: 'ado_remote_active_streams',
    help: 'Number of active streams',
  }),
};
```

### Tracing

```typescript
// OpenTelemetry tracing
const tracer = trace.getTracer('ado-remote');

async function executeRemote(task: Task): Promise<TaskResult> {
  const span = tracer.startSpan('remote.execute', {
    attributes: {
      'task.id': task.id,
      'task.type': task.taskType,
      'execution.mode': 'remote',
    },
  });

  try {
    const result = await doExecute(task);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    throw error;
  } finally {
    span.end();
  }
}
```

## CLI Integration

### Commands

```bash
# Execute remotely
ado run "task" --remote

# With specific worker count
ado run "task" --remote --workers 5

# With cost limit
ado run "task" --remote --max-cost 10

# Hybrid mode
ado run "task" --hybrid

# Attach to remote task
ado attach <task-id>

# View remote logs
ado logs <task-id> --follow

# Cancel remote task
ado cancel <task-id>
```

### Configuration

```yaml
# ado.config.yaml
remote:
  enabled: true

  # Default execution mode
  defaultMode: local  # local | remote | hybrid

  # API Gateway
  apiUrl: https://api.ado.example.com
  wsUrl: wss://api.ado.example.com

  # Authentication
  auth:
    type: api_key
    keyEnvVar: ADO_API_KEY

  # Streaming
  streaming:
    reconnectAttempts: 5
    reconnectDelay: 1000
    bufferSize: 1000
    heartbeatInterval: 30000

  # Defaults
  defaults:
    workers: 3
    timeout: 3600
    maxCost: 50
```

---

## Souvislosti

- [Cloud Agent Controller](./cloud-agent-controller.md)
- [State Synchronization](./state-synchronization.md)
- [Architecture: tRPC API](../../03-architecture/05-communication/trpc-api.md)
- [Architecture: WebSocket Streaming](../../03-architecture/05-communication/websocket-streaming.md)
- [M7: Distributed Control](../../08-implementation/milestones/M7-distributed-control.md)

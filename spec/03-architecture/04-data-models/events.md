# Data Models: Events

## Přehled

Definice všech eventů v systému ADO. Eventy jsou základním mechanismem komunikace mezi komponentami a pro real-time notifikace.

## Event Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Producer   │────▶│Event Stream │────▶│  Consumer   │
│             │     │             │     │             │
│ Orchestrator│     │  - Redis    │     │ - WebSocket │
│ Workers     │     │  - PostgreSQL│    │ - Dashboard │
│ Adapters    │     │  - Memory   │     │ - CLI       │
└─────────────┘     └─────────────┘     │ - Webhooks  │
                                        └─────────────┘
```

## Base Event Interface

```typescript
interface BaseEvent {
  // Identifikace
  id: string;                    // UUID v7
  type: string;                  // Event type (discriminator)
  version: string;               // Schema version (semver)

  // Kontext
  source: EventSource;
  correlationId?: string;        // Pro trasování
  causationId?: string;          // ID předchozího eventu

  // Časování
  timestamp: Date;

  // Metadata
  metadata: EventMetadata;
}

interface EventSource {
  service: string;               // 'orchestrator', 'worker', 'api-gateway'
  instance: string;              // Instance ID
  version: string;               // Service version
}

interface EventMetadata {
  userId?: string;
  taskId?: string;
  workerId?: string;
  providerId?: string;
  traceId?: string;
  spanId?: string;
}
```

## Task Events

### task.created

```typescript
interface TaskCreatedEvent extends BaseEvent {
  type: 'task.created';
  payload: {
    taskId: string;
    prompt: string;
    taskType: TaskType;
    config: TaskConfig;
    userId: string;
    queuePosition: number;
    estimatedStart?: Date;
  };
}
```

### task.queued

```typescript
interface TaskQueuedEvent extends BaseEvent {
  type: 'task.queued';
  payload: {
    taskId: string;
    queuePosition: number;
    estimatedWait: number;       // v sekundách
    queuedAt: Date;
  };
}
```

### task.started

```typescript
interface TaskStartedEvent extends BaseEvent {
  type: 'task.started';
  payload: {
    taskId: string;
    workerId: string;
    providerId: string;
    accessMode: AccessModeType;
    startedAt: Date;
  };
}
```

### task.progress

```typescript
interface TaskProgressEvent extends BaseEvent {
  type: 'task.progress';
  payload: {
    taskId: string;
    progress: number;            // 0-100
    phase: TaskPhase;
    currentStep: string;

    subtask?: {
      id: string;
      name: string;
      progress: number;
    };

    metrics?: {
      elapsed: number;
      estimatedRemaining: number;
      tokensUsed: number;
      cost: number;
    };
  };
}
```

### task.output

```typescript
interface TaskOutputEvent extends BaseEvent {
  type: 'task.output';
  payload: {
    taskId: string;
    stream: 'stdout' | 'stderr';
    data: string;

    // Kontext
    workerId: string;
    agentId: string;
    subtaskId?: string;
  };
}
```

### task.phase_changed

```typescript
interface TaskPhaseChangedEvent extends BaseEvent {
  type: 'task.phase_changed';
  payload: {
    taskId: string;
    previousPhase: TaskPhase;
    newPhase: TaskPhase;
    reason?: string;
  };
}
```

### task.completed

```typescript
interface TaskCompletedEvent extends BaseEvent {
  type: 'task.completed';
  payload: {
    taskId: string;

    result: {
      success: true;

      // Soubory
      filesCreated: string[];
      filesModified: string[];
      filesDeleted: string[];

      // Kvalita
      testsRun: number;
      testsPassed: number;
      coverage: number;
      lintErrors: number;

      // Git
      commitHash?: string;
      branch?: string;
      pullRequestUrl?: string;

      // Dokumentace
      specPath: string;
      changelogEntry?: string;
    };

    metrics: {
      totalDuration: number;
      phaseBreakdown: Record<TaskPhase, number>;
      tokensUsed: number;
      cost: number;
      retryCount: number;
    };
  };
}
```

### task.failed

```typescript
interface TaskFailedEvent extends BaseEvent {
  type: 'task.failed';
  payload: {
    taskId: string;

    error: {
      code: string;
      message: string;
      details?: unknown;
      stack?: string;
      recoverable: boolean;
    };

    context: {
      phase: TaskPhase;
      subtaskId?: string;
      lastSuccessfulCheckpoint?: string;
    };

    metrics: {
      duration: number;
      tokensUsed: number;
      cost: number;
    };
  };
}
```

### task.cancelled

```typescript
interface TaskCancelledEvent extends BaseEvent {
  type: 'task.cancelled';
  payload: {
    taskId: string;
    reason: string;
    cancelledBy: 'user' | 'system' | 'timeout';
    lastCheckpoint?: string;

    metrics: {
      duration: number;
      tokensUsed: number;
      cost: number;
    };
  };
}
```

### task.paused

```typescript
interface TaskPausedEvent extends BaseEvent {
  type: 'task.paused';
  payload: {
    taskId: string;
    reason: string;
    checkpointId: string;
    resumeToken?: string;
  };
}
```

### task.resumed

```typescript
interface TaskResumedEvent extends BaseEvent {
  type: 'task.resumed';
  payload: {
    taskId: string;
    checkpointId: string;
    resumedBy: string;
  };
}
```

## Checkpoint Events

### checkpoint.created

```typescript
interface CheckpointCreatedEvent extends BaseEvent {
  type: 'checkpoint.created';
  payload: {
    checkpointId: string;
    taskId: string;
    type: CheckpointType;
    trigger: CheckpointTrigger;

    hitlRequired: boolean;

    description: string;
    workspaceRef: string;
  };
}
```

### checkpoint.hitl_required

```typescript
interface CheckpointHITLRequiredEvent extends BaseEvent {
  type: 'checkpoint.hitl_required';
  payload: {
    checkpointId: string;
    taskId: string;
    checkpointType: string;

    title: string;
    description: string;

    options: Array<{
      id: string;
      label: string;
      description: string;
      action: HITLAction;
    }>;

    context?: {
      spec?: string;
      changes?: string[];
      cost?: number;
      risk?: 'low' | 'medium' | 'high';
    };

    timeout: Date;
    defaultAction: HITLAction;
  };
}
```

### checkpoint.hitl_decided

```typescript
interface CheckpointHITLDecidedEvent extends BaseEvent {
  type: 'checkpoint.hitl_decided';
  payload: {
    checkpointId: string;
    taskId: string;
    decisionId: string;

    action: HITLAction;
    selectedOption: string;
    feedback?: string;

    decidedBy: string;
    responseTime: number;
    autoTriggered: boolean;
  };
}
```

### checkpoint.restored

```typescript
interface CheckpointRestoredEvent extends BaseEvent {
  type: 'checkpoint.restored';
  payload: {
    checkpointId: string;
    taskId: string;
    restoredBy: string;
    reason: string;
  };
}
```

## Worker Events

### worker.registered

```typescript
interface WorkerRegisteredEvent extends BaseEvent {
  type: 'worker.registered';
  payload: {
    workerId: string;
    hostname: string;
    type: WorkerType;
    location: WorkerLocation;
    capabilities: string[];
    resources: WorkerResources;
    version: string;
  };
}
```

### worker.heartbeat

```typescript
interface WorkerHeartbeatEvent extends BaseEvent {
  type: 'worker.heartbeat';
  payload: {
    workerId: string;
    status: WorkerStatus;
    currentTaskId?: string;

    metrics: {
      cpuUsage: number;
      memoryUsage: number;
      diskUsage: number;
      taskDuration?: number;
    };
  };
}
```

### worker.status_changed

```typescript
interface WorkerStatusChangedEvent extends BaseEvent {
  type: 'worker.status_changed';
  payload: {
    workerId: string;
    previousStatus: WorkerStatus;
    newStatus: WorkerStatus;
    reason?: string;
  };
}
```

### worker.task_assigned

```typescript
interface WorkerTaskAssignedEvent extends BaseEvent {
  type: 'worker.task_assigned';
  payload: {
    workerId: string;
    taskId: string;
    providerId: string;
    estimatedDuration?: number;
  };
}
```

### worker.offline

```typescript
interface WorkerOfflineEvent extends BaseEvent {
  type: 'worker.offline';
  payload: {
    workerId: string;
    lastHeartbeat: Date;
    lastTaskId?: string;
    reason: 'timeout' | 'shutdown' | 'error';
  };
}
```

## Provider Events

### provider.status_changed

```typescript
interface ProviderStatusChangedEvent extends BaseEvent {
  type: 'provider.status_changed';
  payload: {
    providerId: string;
    previousStatus: ProviderStatus;
    newStatus: ProviderStatus;
    reason?: string;

    rateLimit?: {
      remaining: number;
      resetAt: Date;
    };
  };
}
```

### provider.rate_limited

```typescript
interface ProviderRateLimitedEvent extends BaseEvent {
  type: 'provider.rate_limited';
  payload: {
    providerId: string;
    accessMode: AccessModeType;

    limit: {
      type: 'requests' | 'tokens';
      period: 'minute' | 'hour' | 'day';
      limit: number;
      used: number;
    };

    resetAt: Date;
    estimatedWait: number;

    fallbackProvider?: string;
  };
}
```

### provider.fallback_triggered

```typescript
interface ProviderFallbackTriggeredEvent extends BaseEvent {
  type: 'provider.fallback_triggered';
  payload: {
    taskId: string;
    fromProvider: string;
    toProvider: string;
    reason: 'rate_limit' | 'error' | 'unavailable';

    impact: {
      costChange?: number;
      capabilityChange?: string[];
    };
  };
}
```

## Subtask Events

### subtask.created

```typescript
interface SubtaskCreatedEvent extends BaseEvent {
  type: 'subtask.created';
  payload: {
    subtaskId: string;
    taskId: string;
    name: string;
    description: string;
    order: number;
    dependencies: string[];
  };
}
```

### subtask.started

```typescript
interface SubtaskStartedEvent extends BaseEvent {
  type: 'subtask.started';
  payload: {
    subtaskId: string;
    taskId: string;
    agentId?: string;
    estimatedDuration?: number;
  };
}
```

### subtask.completed

```typescript
interface SubtaskCompletedEvent extends BaseEvent {
  type: 'subtask.completed';
  payload: {
    subtaskId: string;
    taskId: string;

    result: {
      success: boolean;
      filesChanged: string[];
      output?: string;
    };

    duration: number;
  };
}
```

### subtask.failed

```typescript
interface SubtaskFailedEvent extends BaseEvent {
  type: 'subtask.failed';
  payload: {
    subtaskId: string;
    taskId: string;

    error: {
      code: string;
      message: string;
      recoverable: boolean;
    };
  };
}
```

## System Events

### system.health_check

```typescript
interface SystemHealthCheckEvent extends BaseEvent {
  type: 'system.health_check';
  payload: {
    status: 'healthy' | 'degraded' | 'unhealthy';

    components: Record<string, {
      status: 'up' | 'down' | 'degraded';
      latency?: number;
      message?: string;
    }>;

    metrics: {
      activeWorkers: number;
      pendingTasks: number;
      runningTasks: number;
      queueLength: number;
    };
  };
}
```

### system.config_changed

```typescript
interface SystemConfigChangedEvent extends BaseEvent {
  type: 'system.config_changed';
  payload: {
    changedBy: string;
    changes: Array<{
      path: string;
      oldValue: unknown;
      newValue: unknown;
    }>;
  };
}
```

### system.alert

```typescript
interface SystemAlertEvent extends BaseEvent {
  type: 'system.alert';
  payload: {
    severity: 'info' | 'warning' | 'error' | 'critical';
    title: string;
    message: string;

    context?: Record<string, unknown>;

    actions?: Array<{
      label: string;
      url?: string;
      action?: string;
    }>;
  };
}
```

## Event Union Type

```typescript
type OrchestratorEvent =
  // Task events
  | TaskCreatedEvent
  | TaskQueuedEvent
  | TaskStartedEvent
  | TaskProgressEvent
  | TaskOutputEvent
  | TaskPhaseChangedEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | TaskCancelledEvent
  | TaskPausedEvent
  | TaskResumedEvent
  // Checkpoint events
  | CheckpointCreatedEvent
  | CheckpointHITLRequiredEvent
  | CheckpointHITLDecidedEvent
  | CheckpointRestoredEvent
  // Worker events
  | WorkerRegisteredEvent
  | WorkerHeartbeatEvent
  | WorkerStatusChangedEvent
  | WorkerTaskAssignedEvent
  | WorkerOfflineEvent
  // Provider events
  | ProviderStatusChangedEvent
  | ProviderRateLimitedEvent
  | ProviderFallbackTriggeredEvent
  // Subtask events
  | SubtaskCreatedEvent
  | SubtaskStartedEvent
  | SubtaskCompletedEvent
  | SubtaskFailedEvent
  // System events
  | SystemHealthCheckEvent
  | SystemConfigChangedEvent
  | SystemAlertEvent;
```

## Event Storage

```sql
-- Event log table
CREATE TABLE events (
  id UUID PRIMARY KEY,
  type VARCHAR(100) NOT NULL,
  version VARCHAR(20) NOT NULL,

  source JSONB NOT NULL,
  correlation_id UUID,
  causation_id UUID,

  payload JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',

  timestamp TIMESTAMPTZ NOT NULL,

  -- Partitioning by month
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Indexes
CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_correlation_id ON events(correlation_id);
CREATE INDEX idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX idx_events_metadata_task_id ON events((metadata->>'taskId'));

-- Partitions
CREATE TABLE events_2025_01 PARTITION OF events
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

---

## Souvislosti

- [Data Models: Entities](./entities.md)
- [WebSocket Events: Task Events](../../05-api/02-websocket-events/task-events.md)
- [WebSocket Streaming](../05-communication/websocket-streaming.md)

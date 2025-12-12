# Agent WebSocket Events

## Přehled

Dokumentace WebSocket eventů souvisejících s AI agenty a workery.

## Subscription

```typescript
// Subscribe to agent/worker events
trpc.stream.agentEvents.subscribe({ providerId: 'claude-code' }, {
  onData: (event) => { /* handle event */ },
  onError: (error) => { /* handle error */ },
});

// Subscribe to all worker events
trpc.stream.workerEvents.subscribe(undefined, {
  onData: (event) => { /* handle event */ },
});
```

## Agent Events

### agent.spawned

Agent byl spuštěn pro úkol.

```typescript
{
  type: "agent.spawned",
  payload: {
    agentId: string;           // Unique agent instance ID
    providerId: string;        // Provider ID (claude-code, etc.)
    taskId: string;
    workerId: string;
    accessMode: "subscription" | "api" | "local";

    process: {
      pid: number;
      command: string;
      args: string[];
      cwd: string;
    };

    capabilities: {
      codeGeneration: boolean;
      webSearch: boolean;
      // ... další
    };
  },
  timestamp: string
}
```

---

### agent.ready

Agent je připraven přijímat instrukce.

```typescript
{
  type: "agent.ready",
  payload: {
    agentId: string;
    providerId: string;
    taskId: string;

    initialization: {
      duration: number;        // ms
      contextLoaded: boolean;
      contextTokens: number;
    };
  },
  timestamp: string
}
```

---

### agent.thinking

Agent přemýšlí (pro providery s thinking módem).

```typescript
{
  type: "agent.thinking",
  payload: {
    agentId: string;
    taskId: string;

    thinking: {
      content: string;         // Thinking content (if available)
      tokensUsed: number;
    };
  },
  timestamp: string
}
```

---

### agent.tool_call

Agent volá nástroj.

```typescript
{
  type: "agent.tool_call",
  payload: {
    agentId: string;
    taskId: string;

    tool: {
      name: string;            // read_file, write_file, bash, etc.
      input: unknown;          // Tool input parameters
      startedAt: string;
    };
  },
  timestamp: string
}
```

---

### agent.tool_result

Výsledek volání nástroje.

```typescript
{
  type: "agent.tool_result",
  payload: {
    agentId: string;
    taskId: string;

    tool: {
      name: string;
      duration: number;        // ms
      success: boolean;
      output?: unknown;
      error?: string;
    };
  },
  timestamp: string
}
```

---

### agent.file_change

Agent změnil soubor.

```typescript
{
  type: "agent.file_change",
  payload: {
    agentId: string;
    taskId: string;

    file: {
      path: string;
      action: "create" | "modify" | "delete";
      linesAdded?: number;
      linesRemoved?: number;
      diff?: string;           // Unified diff (truncated)
    };
  },
  timestamp: string
}
```

---

### agent.error

Agent narazil na chybu.

```typescript
{
  type: "agent.error",
  payload: {
    agentId: string;
    taskId: string;
    providerId: string;

    error: {
      code: string;
      message: string;
      recoverable: boolean;
      context?: unknown;
    };

    action: {
      type: "retry" | "fallback" | "abort";
      fallbackProvider?: string;
      retryCount?: number;
    };
  },
  timestamp: string
}
```

---

### agent.rate_limited

Agent byl rate-limited.

```typescript
{
  type: "agent.rate_limited",
  payload: {
    agentId: string;
    taskId: string;
    providerId: string;
    accessMode: "subscription" | "api";

    limit: {
      type: "requests" | "tokens";
      current: number;
      max: number;
      resetAt: string;         // ISO date
    };

    action: {
      type: "wait" | "fallback";
      waitSeconds?: number;
      fallbackProvider?: string;
    };
  },
  timestamp: string
}
```

---

### agent.completed

Agent dokončil práci.

```typescript
{
  type: "agent.completed",
  payload: {
    agentId: string;
    taskId: string;
    providerId: string;

    result: {
      success: boolean;
      exitCode: number;
    };

    metrics: {
      duration: number;        // ms
      tokensInput: number;
      tokensOutput: number;
      tokensTotal: number;
      toolCalls: number;
      filesChanged: number;
      cost: number;            // USD
    };
  },
  timestamp: string
}
```

---

### agent.terminated

Agent byl ukončen (kill/cancel).

```typescript
{
  type: "agent.terminated",
  payload: {
    agentId: string;
    taskId: string;
    providerId: string;

    reason: "user_cancel" | "timeout" | "error" | "system";
    signal?: string;           // SIGTERM, SIGKILL, etc.

    metrics: {
      duration: number;
      tokensUsed: number;
      cost: number;
    };
  },
  timestamp: string
}
```

---

## Worker Events

### worker.registered

Nový worker se zaregistroval.

```typescript
{
  type: "worker.registered",
  payload: {
    workerId: string;

    info: {
      hostname: string;
      type: "local" | "remote" | "cloud";
      version: string;

      location: {
        type: "kubernetes";
        namespace: string;
        pod: string;
      } | {
        type: "docker";
        container: string;
      } | {
        type: "ec2";
        instanceId: string;
        region: string;
      } | {
        type: "local";
      };

      capabilities: string[];  // Provider IDs
      resources: {
        cpuCores: number;
        memoryMB: number;
        diskGB: number;
        gpuCount?: number;
      };
    };
  },
  timestamp: string
}
```

---

### worker.heartbeat

Periodický heartbeat od workeru.

```typescript
{
  type: "worker.heartbeat",
  payload: {
    workerId: string;
    status: "idle" | "busy" | "draining";

    currentTask?: {
      taskId: string;
      progress: number;
      startedAt: string;
    };

    metrics: {
      cpuUsage: number;        // 0-100%
      memoryUsage: number;     // 0-100%
      diskUsage: number;       // 0-100%
      uptime: number;          // seconds
    };
  },
  timestamp: string
}
```

**Frekvence:** Každých 30 sekund.

---

### worker.status_changed

Změna stavu workeru.

```typescript
{
  type: "worker.status_changed",
  payload: {
    workerId: string;

    previous: "starting" | "idle" | "busy" | "draining" | "offline";
    current: "starting" | "idle" | "busy" | "draining" | "offline";

    reason?: string;
    taskId?: string;           // If status change is task-related
  },
  timestamp: string
}
```

---

### worker.task_assigned

Úkol byl přiřazen workeru.

```typescript
{
  type: "worker.task_assigned",
  payload: {
    workerId: string;
    taskId: string;
    providerId: string;

    task: {
      prompt: string;          // Truncated
      taskType: string;
      priority: number;
    };

    estimatedDuration?: number; // seconds
  },
  timestamp: string
}
```

---

### worker.task_completed

Worker dokončil úkol.

```typescript
{
  type: "worker.task_completed",
  payload: {
    workerId: string;
    taskId: string;

    result: {
      success: boolean;
      duration: number;
      tokensUsed: number;
      cost: number;
    };

    nextTask?: {
      taskId: string;
      queuePosition: number;
    };
  },
  timestamp: string
}
```

---

### worker.offline

Worker přešel do offline stavu.

```typescript
{
  type: "worker.offline",
  payload: {
    workerId: string;
    hostname: string;

    reason: "shutdown" | "timeout" | "error";
    lastHeartbeat: string;

    orphanedTask?: {
      taskId: string;
      reassigned: boolean;
      newWorkerId?: string;
    };
  },
  timestamp: string
}
```

---

### worker.scaling

Škálování worker pool.

```typescript
{
  type: "worker.scaling",
  payload: {
    action: "scale_up" | "scale_down";

    current: number;           // Current worker count
    target: number;            // Target worker count
    reason: string;            // "queue_length > 50", etc.

    workers: {
      starting?: string[];     // Worker IDs being started
      terminating?: string[];  // Worker IDs being terminated
    };
  },
  timestamp: string
}
```

---

## Provider Events

### provider.available

Provider se stal dostupným.

```typescript
{
  type: "provider.available",
  payload: {
    providerId: string;
    name: string;
    previousStatus: "unavailable" | "rate_limited" | "disabled";

    accessMode: "subscription" | "api" | "local";
  },
  timestamp: string
}
```

---

### provider.unavailable

Provider se stal nedostupným.

```typescript
{
  type: "provider.unavailable",
  payload: {
    providerId: string;
    name: string;

    reason: "rate_limited" | "error" | "maintenance" | "disabled";
    error?: string;

    estimatedRecovery?: string; // ISO date
    fallbackProvider?: string;
  },
  timestamp: string
}
```

---

### provider.fallback

Přepnutí na fallback providera.

```typescript
{
  type: "provider.fallback",
  payload: {
    taskId: string;

    from: {
      providerId: string;
      reason: "rate_limited" | "error" | "unavailable";
    };

    to: {
      providerId: string;
      accessMode: "subscription" | "api";
    };

    impact: {
      costIncrease?: number;   // USD difference
      capabilityChange?: string[];
    };
  },
  timestamp: string
}
```

---

## Subscription Management

### Subscribe to specific provider

```typescript
const unsubscribe = trpc.stream.agentEvents.subscribe(
  { providerId: 'claude-code' },
  {
    onData: (event) => {
      switch (event.type) {
        case 'agent.spawned':
          console.log(`Agent started: ${event.payload.agentId}`);
          break;
        case 'agent.file_change':
          console.log(`File changed: ${event.payload.file.path}`);
          break;
        case 'agent.rate_limited':
          showRateLimitWarning(event.payload);
          break;
      }
    },
  }
);
```

### Subscribe to all workers

```typescript
const unsubscribe = trpc.stream.workerEvents.subscribe(undefined, {
  onData: (event) => {
    switch (event.type) {
      case 'worker.registered':
        addWorkerToPool(event.payload);
        break;
      case 'worker.offline':
        removeWorkerFromPool(event.payload.workerId);
        break;
      case 'worker.scaling':
        updateScalingUI(event.payload);
        break;
    }
  },
});
```

### Filter events by task

```typescript
const unsubscribe = trpc.stream.agentEvents.subscribe(
  { taskId: 'task-123' },
  {
    onData: (event) => {
      // Only events related to task-123
      appendToTaskLog(event);
    },
  }
);
```

---

## Event Union Types

```typescript
type AgentEvent =
  | AgentSpawnedEvent
  | AgentReadyEvent
  | AgentThinkingEvent
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentFileChangeEvent
  | AgentErrorEvent
  | AgentRateLimitedEvent
  | AgentCompletedEvent
  | AgentTerminatedEvent;

type WorkerEvent =
  | WorkerRegisteredEvent
  | WorkerHeartbeatEvent
  | WorkerStatusChangedEvent
  | WorkerTaskAssignedEvent
  | WorkerTaskCompletedEvent
  | WorkerOfflineEvent
  | WorkerScalingEvent;

type ProviderEvent =
  | ProviderAvailableEvent
  | ProviderUnavailableEvent
  | ProviderFallbackEvent;
```

---

## Souvislosti

- [Task WebSocket Events](./task-events.md)
- [WebSocket Streaming](../../03-architecture/05-communication/websocket-streaming.md)
- [Agent Adapters](../../03-architecture/03-component-diagrams/agent-adapters.md)
- [Data Models: Events](../../03-architecture/04-data-models/events.md)

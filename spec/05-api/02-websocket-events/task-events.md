# Task WebSocket Events

## Přehled

Dokumentace WebSocket eventů souvisejících s úkoly (tasks).

## Subscription

```typescript
// Subscribe to task events
trpc.stream.taskProgress.subscribe(taskId, {
  onData: (event) => { /* handle event */ },
  onError: (error) => { /* handle error */ },
});
```

## Event Types

### task.created

Nový úkol byl vytvořen.

```typescript
{
  type: "task.created",
  payload: {
    taskId: string;
    prompt: string;
    taskType: string;
    queuePosition: number;
    estimatedStart: string;  // ISO date
  },
  timestamp: string
}
```

---

### task.started

Úkol začal být zpracováván.

```typescript
{
  type: "task.started",
  payload: {
    taskId: string;
    workerId: string;
    providerId: string;
    accessMode: "subscription" | "api";
  },
  timestamp: string
}
```

---

### task.progress

Průběžná aktualizace stavu.

```typescript
{
  type: "task.progress",
  payload: {
    taskId: string;
    progress: number;        // 0-100
    currentStep: string;

    subtask?: {
      id: string;
      name: string;
      progress: number;
    };

    metrics?: {
      elapsed: number;       // seconds
      estimatedRemaining: number;
      tokensUsed: number;
      cost: number;
    };
  },
  timestamp: string
}
```

**Frekvence:** Max 1x za sekundu pro stejný task.

---

### task.output

Výstup z agenta (stdout/stderr).

```typescript
{
  type: "task.output",
  payload: {
    taskId: string;
    stream: "stdout" | "stderr";
    data: string;
    workerId: string;
    agentId: string;
  },
  timestamp: string
}
```

**Poznámka:** Výstup je bufferován a odesílán v chunkcích (~100 chars nebo 100ms timeout).

---

### task.subtask.started

Začátek podúkolu.

```typescript
{
  type: "task.subtask.started",
  payload: {
    taskId: string;
    subtaskId: string;
    name: string;
    description: string;
    agentId: string;
  },
  timestamp: string
}
```

---

### task.subtask.completed

Dokončení podúkolu.

```typescript
{
  type: "task.subtask.completed",
  payload: {
    taskId: string;
    subtaskId: string;
    name: string;
    duration: number;       // seconds
    artifacts: string[];    // created/modified files
  },
  timestamp: string
}
```

---

### task.checkpoint

Checkpoint vytvořen.

```typescript
{
  type: "task.checkpoint",
  payload: {
    taskId: string;
    checkpointId: string;
    type: "auto" | "hitl" | "manual";
    reason: string;
  },
  timestamp: string
}
```

---

### task.hitl_required

Vyžadována lidská interakce.

```typescript
{
  type: "task.hitl_required",
  payload: {
    taskId: string;
    checkpointId: string;
    checkpointType: string;  // "spec_review", "architecture", etc.

    title: string;
    description: string;

    options: Array<{
      id: string;
      label: string;
      description: string;
    }>;

    context?: {
      spec?: string;
      changes?: string[];
      cost?: number;
    };

    timeout: string;         // ISO date when auto-action triggers
    defaultAction: string;   // What happens on timeout
  },
  timestamp: string
}
```

---

### task.completed

Úkol úspěšně dokončen.

```typescript
{
  type: "task.completed",
  payload: {
    taskId: string;

    result: {
      success: true;

      // Files
      filesCreated: string[];
      filesModified: string[];
      filesDeleted: string[];

      // Quality
      testsRun: number;
      testsPassed: number;
      coverage: number;

      // Git
      commitHash?: string;
      pullRequestUrl?: string;

      // Docs
      specPath: string;
      changelogEntry?: string;
    };

    metrics: {
      totalDuration: number;
      providerTime: Record<string, number>;
      tokensUsed: number;
      cost: number;
    };
  },
  timestamp: string
}
```

---

### task.failed

Úkol selhal.

```typescript
{
  type: "task.failed",
  payload: {
    taskId: string;

    error: {
      code: string;
      message: string;
      details?: unknown;
      recoverable: boolean;
    };

    lastCheckpoint?: string;

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

### task.cancelled

Úkol byl zrušen.

```typescript
{
  type: "task.cancelled",
  payload: {
    taskId: string;
    reason: string;
    cancelledBy: "user" | "system" | "timeout";
    lastCheckpoint?: string;
  },
  timestamp: string
}
```

---

## Subscription Management

### Subscribe to specific task

```typescript
const unsubscribe = trpc.stream.taskProgress.subscribe(taskId, {
  onData: (event) => {
    switch (event.type) {
      case 'task.progress':
        updateProgress(event.payload.progress);
        break;
      case 'task.output':
        appendOutput(event.payload.data);
        break;
      case 'task.hitl_required':
        showCheckpointDialog(event.payload);
        break;
      case 'task.completed':
        showSuccess(event.payload.result);
        break;
      case 'task.failed':
        showError(event.payload.error);
        break;
    }
  },
  onError: (error) => {
    console.error('Subscription error:', error);
  },
});

// Later: cleanup
unsubscribe();
```

### Subscribe to all tasks (admin)

```typescript
trpc.stream.systemEvents.subscribe(undefined, {
  onData: (event) => {
    // All task events for all tasks
  },
});
```

---

## Souvislosti

- [Architecture: WebSocket Streaming](../../03-architecture/05-communication/websocket-streaming.md)
- [API: Tasks Procedures](../01-trpc-procedures/tasks.md)

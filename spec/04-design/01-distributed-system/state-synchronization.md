# State Synchronization

## Přehled

Design synchronizace stavu mezi lokálním CLI, API Gateway a vzdálenými workers v distribuovaném prostředí ADO.

## Architektura synchronizace

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   CLI       │     │ API Gateway │     │   Worker    │
│   (Local)   │     │  (Central)  │     │  (Remote)   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │ ──WebSocket───▶   │   ◀──gRPC────    │
       │                   │                   │
       │   ┌───────────────┴───────────────┐  │
       │   │                               │  │
       ▼   ▼                               ▼  ▼
┌─────────────────────────────────────────────────────┐
│                   PostgreSQL                         │
│                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │   Tasks     │  │ Checkpoints │  │   Workers   │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
│                                                      │
│  ┌─────────────┐  ┌─────────────┐                   │
│  │   Events    │  │   Locks     │                   │
│  └─────────────┘  └─────────────┘                   │
└─────────────────────────────────────────────────────┘
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────┐
│                      Redis                           │
│                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │   Pub/Sub   │  │    Cache    │  │   Streams   │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────┘
```

## Synchronizační strategie

### 1. Eventual Consistency Model

ADO používá eventual consistency pro většinu operací s okamžitou konzistencí pro kritické operace.

```typescript
type ConsistencyLevel = 'eventual' | 'strong';

interface SyncConfig {
  // Většina operací
  default: 'eventual';

  // Kritické operace vyžadující strong consistency
  strongConsistency: [
    'task.create',
    'task.cancel',
    'checkpoint.create',
    'hitl.decide',
    'worker.register',
  ];
}
```

### 2. State Categories

```typescript
// Kategorie stavu podle požadavků na synchronizaci
interface StateCategories {
  // Kritický stav - musí být konzistentní okamžitě
  critical: {
    taskStatus: TaskStatus;
    workerAssignment: string | null;
    hitlDecisions: HITLDecision[];
  };

  // Důležitý stav - konzistence do 1 sekundy
  important: {
    taskProgress: number;
    subtaskStatus: SubtaskStatus[];
    checkpoints: Checkpoint[];
  };

  // Informativní stav - konzistence do 5 sekund
  informational: {
    metrics: TaskMetrics;
    output: string[];
    logs: LogEntry[];
  };
}
```

## Synchronizační mechanismy

### 1. PostgreSQL LISTEN/NOTIFY

Pro kritické změny stavu.

```typescript
// Publisher
class StatePublisher {
  async publishStateChange(change: StateChange): Promise<void> {
    await this.db.query(
      `SELECT pg_notify($1, $2)`,
      [change.channel, JSON.stringify(change.payload)]
    );
  }
}

// Subscriber
class StateSubscriber {
  private client: pg.Client;

  async subscribe(channels: string[]): Promise<void> {
    for (const channel of channels) {
      await this.client.query(`LISTEN ${channel}`);
    }

    this.client.on('notification', (msg) => {
      this.handleNotification(msg.channel, JSON.parse(msg.payload));
    });
  }

  private handleNotification(channel: string, payload: unknown): void {
    switch (channel) {
      case 'task_status_changed':
        this.eventEmitter.emit('task.status_changed', payload);
        break;
      case 'checkpoint_created':
        this.eventEmitter.emit('checkpoint.created', payload);
        break;
      // ...
    }
  }
}
```

### 2. Redis Pub/Sub

Pro broadcast eventů do všech klientů.

```typescript
class RedisPubSub {
  private publisher: Redis;
  private subscriber: Redis;
  private handlers = new Map<string, Set<Handler>>();

  async publish(channel: string, message: unknown): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(message));
  }

  async subscribe(pattern: string, handler: Handler): Promise<void> {
    if (!this.handlers.has(pattern)) {
      this.handlers.set(pattern, new Set());
      await this.subscriber.psubscribe(pattern);
    }
    this.handlers.get(pattern)!.add(handler);
  }
}

// Kanály
const channels = {
  task: (taskId: string) => `task:${taskId}`,
  worker: (workerId: string) => `worker:${workerId}`,
  system: 'system:events',
  user: (userId: string) => `user:${userId}`,
};
```

### 3. Redis Streams

Pro perzistentní event log s replay možností.

```typescript
class EventStream {
  private redis: Redis;

  // Přidání eventu do streamu
  async append(streamKey: string, event: Event): Promise<string> {
    const id = await this.redis.xadd(
      streamKey,
      '*',
      'type', event.type,
      'data', JSON.stringify(event),
      'timestamp', Date.now().toString()
    );
    return id;
  }

  // Čtení eventů od určitého ID
  async read(
    streamKey: string,
    fromId: string = '0',
    count: number = 100
  ): Promise<Event[]> {
    const entries = await this.redis.xrange(
      streamKey,
      fromId,
      '+',
      'COUNT', count
    );

    return entries.map(([id, fields]) => ({
      id,
      ...JSON.parse(fields.data),
    }));
  }

  // Čtení s blokováním (pro real-time)
  async readBlocking(
    streamKey: string,
    lastId: string,
    timeout: number = 5000
  ): Promise<Event[]> {
    const result = await this.redis.xread(
      'BLOCK', timeout,
      'STREAMS', streamKey, lastId
    );

    if (!result) return [];

    return result[0][1].map(([id, fields]) => ({
      id,
      ...JSON.parse(fields.data),
    }));
  }
}
```

## Optimistic Locking

Pro prevenci race conditions při aktualizacích.

```typescript
interface OptimisticLock {
  version: number;
  updatedAt: Date;
}

class TaskRepository {
  async update(
    taskId: string,
    update: Partial<Task>,
    expectedVersion: number
  ): Promise<Task> {
    const result = await this.db.query(
      `UPDATE tasks
       SET
         status = COALESCE($2, status),
         progress = COALESCE($3, progress),
         version = version + 1,
         updated_at = NOW()
       WHERE id = $1 AND version = $4
       RETURNING *`,
      [taskId, update.status, update.progress, expectedVersion]
    );

    if (result.rowCount === 0) {
      throw new OptimisticLockError(taskId, expectedVersion);
    }

    return result.rows[0];
  }
}

// Retry strategie
async function updateWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof OptimisticLockError && i < maxRetries - 1) {
        await delay(Math.pow(2, i) * 100); // Exponential backoff
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
```

## Distributed Locking

Pro exkluzivní přístup ke sdíleným zdrojům.

```typescript
class DistributedLock {
  private redis: Redis;

  async acquire(
    resource: string,
    ttl: number = 30000
  ): Promise<LockHandle | null> {
    const token = crypto.randomUUID();
    const key = `lock:${resource}`;

    const acquired = await this.redis.set(
      key,
      token,
      'NX',  // Only if not exists
      'PX', ttl
    );

    if (!acquired) return null;

    return {
      token,
      resource,
      release: () => this.release(resource, token),
      extend: (ms: number) => this.extend(resource, token, ms),
    };
  }

  async release(resource: string, token: string): Promise<boolean> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await this.redis.eval(
      script,
      1,
      `lock:${resource}`,
      token
    );

    return result === 1;
  }

  async extend(
    resource: string,
    token: string,
    ttl: number
  ): Promise<boolean> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    const result = await this.redis.eval(
      script,
      1,
      `lock:${resource}`,
      token,
      ttl
    );

    return result === 1;
  }
}

// Použití
async function assignTaskToWorker(
  taskId: string,
  workerId: string
): Promise<void> {
  const lock = await distributedLock.acquire(`task:${taskId}`);

  if (!lock) {
    throw new ConcurrentModificationError('Task is being modified');
  }

  try {
    // Kritická sekce
    const task = await taskRepository.get(taskId);
    if (task.workerId) {
      throw new TaskAlreadyAssignedError(taskId);
    }

    await taskRepository.update(taskId, { workerId }, task.version);
  } finally {
    await lock.release();
  }
}
```

## State Sync Protocol

### Worker → API Gateway

```typescript
interface WorkerSyncMessage {
  type: 'sync';
  workerId: string;
  sequence: number;

  // Delta změny od posledního sync
  changes: {
    task?: {
      taskId: string;
      status?: TaskStatus;
      progress?: number;
      phase?: TaskPhase;
    };
    output?: {
      taskId: string;
      data: string;
      stream: 'stdout' | 'stderr';
    }[];
    checkpoint?: {
      taskId: string;
      checkpointId: string;
      type: CheckpointType;
    };
    metrics?: {
      taskId: string;
      tokensUsed: number;
      cost: number;
    };
  };

  timestamp: number;
}

// Server handler
class SyncHandler {
  private lastSequence = new Map<string, number>();

  async handleSync(message: WorkerSyncMessage): Promise<SyncAck> {
    const lastSeq = this.lastSequence.get(message.workerId) ?? 0;

    // Detekce out-of-order messages
    if (message.sequence <= lastSeq) {
      return {
        type: 'ack',
        accepted: false,
        reason: 'sequence_mismatch',
        expectedSequence: lastSeq + 1,
      };
    }

    // Detekce chybějících messages
    if (message.sequence > lastSeq + 1) {
      return {
        type: 'ack',
        accepted: false,
        reason: 'gap_detected',
        expectedSequence: lastSeq + 1,
      };
    }

    // Zpracování změn
    await this.processChanges(message.changes);

    this.lastSequence.set(message.workerId, message.sequence);

    return {
      type: 'ack',
      accepted: true,
      sequence: message.sequence,
    };
  }
}
```

### CLI → API Gateway

```typescript
// WebSocket subscription pro real-time updates
class CLIStateSync {
  private ws: WebSocket;
  private subscriptions = new Set<string>();

  async subscribeToTask(taskId: string): Promise<void> {
    this.subscriptions.add(taskId);

    this.ws.send(JSON.stringify({
      type: 'subscribe',
      channel: `task:${taskId}`,
    }));
  }

  handleMessage(message: unknown): void {
    const msg = JSON.parse(message as string);

    switch (msg.type) {
      case 'task.progress':
        this.updateProgress(msg.payload);
        break;
      case 'task.output':
        this.appendOutput(msg.payload);
        break;
      case 'task.status_changed':
        this.updateStatus(msg.payload);
        break;
      case 'checkpoint.hitl_required':
        this.showHITLPrompt(msg.payload);
        break;
    }
  }

  // Reconnection s replay
  async reconnect(lastEventId: string): Promise<void> {
    await this.connect();

    // Obnovení subscriptions
    for (const taskId of this.subscriptions) {
      await this.subscribeToTask(taskId);
    }

    // Replay missed events
    const missedEvents = await this.fetchMissedEvents(lastEventId);
    for (const event of missedEvents) {
      this.handleMessage(JSON.stringify(event));
    }
  }
}
```

## Conflict Resolution

```typescript
type ConflictResolution = 'last_write_wins' | 'merge' | 'manual';

interface ConflictResolver {
  resolve(
    local: StateValue,
    remote: StateValue,
    strategy: ConflictResolution
  ): StateValue;
}

class TaskConflictResolver implements ConflictResolver {
  resolve(local: Task, remote: Task, strategy: ConflictResolution): Task {
    switch (strategy) {
      case 'last_write_wins':
        return local.updatedAt > remote.updatedAt ? local : remote;

      case 'merge':
        return this.mergeTask(local, remote);

      case 'manual':
        throw new ManualResolutionRequired(local, remote);
    }
  }

  private mergeTask(local: Task, remote: Task): Task {
    // Merge pravidla pro jednotlivá pole
    return {
      ...remote,  // Base
      // Lokální změny mají přednost pro některá pole
      progress: Math.max(local.progress, remote.progress),
      metrics: this.mergeMetrics(local.metrics, remote.metrics),
    };
  }

  private mergeMetrics(local: TaskMetrics, remote: TaskMetrics): TaskMetrics {
    return {
      tokensUsed: Math.max(local.tokensUsed, remote.tokensUsed),
      cost: Math.max(local.cost, remote.cost),
      duration: Math.max(local.duration, remote.duration),
      // ... další pole
    };
  }
}
```

## Monitoring synchronizace

```typescript
// Metriky
const syncMetrics = {
  // Latence synchronizace
  sync_latency_ms: new Histogram({
    name: 'ado_sync_latency_milliseconds',
    help: 'Latency of state synchronization',
    labelNames: ['source', 'target', 'state_type'],
    buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000],
  }),

  // Počet konfliktů
  conflicts_total: new Counter({
    name: 'ado_sync_conflicts_total',
    help: 'Total number of sync conflicts',
    labelNames: ['state_type', 'resolution'],
  }),

  // Lag synchronizace
  sync_lag_seconds: new Gauge({
    name: 'ado_sync_lag_seconds',
    help: 'Current synchronization lag',
    labelNames: ['worker_id'],
  }),
};
```

---

## Souvislosti

- [Cloud Agent Controller](./cloud-agent-controller.md)
- [Remote Execution](./remote-execution.md)
- [WebSocket Streaming](../../03-architecture/05-communication/websocket-streaming.md)
- [Data Models: Events](../../03-architecture/04-data-models/events.md)

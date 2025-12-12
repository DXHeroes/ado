# Orchestrator Core - Component Diagram

## Přehled

C4 Level 3 diagram komponent Orchestrator Core - jádra systému pro řízení autonomního workflow.

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ORCHESTRATOR CORE                                  │
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │   Task Manager  │───▶│  Task Scheduler │───▶│  Task Executor  │         │
│  │                 │    │                 │    │                 │         │
│  │ - createTask()  │    │ - schedule()    │    │ - execute()     │         │
│  │ - getTask()     │    │ - prioritize()  │    │ - monitor()     │         │
│  │ - updateTask()  │    │ - queue()       │    │ - retry()       │         │
│  │ - cancelTask()  │    │ - dequeue()     │    │ - rollback()    │         │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘         │
│           │                      │                      │                   │
│           ▼                      ▼                      ▼                   │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │                      State Machine                               │       │
│  │                                                                  │       │
│  │   PENDING ──▶ QUEUED ──▶ RUNNING ──▶ VALIDATING ──▶ COMPLETED  │       │
│  │      │          │           │             │              │       │       │
│  │      ▼          ▼           ▼             ▼              ▼       │       │
│  │   CANCELLED  TIMEOUT    PAUSED        FAILED        ARCHIVED    │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │ Checkpoint Mgr  │    │  Event Emitter  │    │  Metrics Coll.  │         │
│  │                 │    │                 │    │                 │         │
│  │ - create()      │    │ - emit()        │    │ - record()      │         │
│  │ - restore()     │    │ - subscribe()   │    │ - aggregate()   │         │
│  │ - list()        │    │ - broadcast()   │    │ - export()      │         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Komponenty

### 1. Task Manager

Zodpovídá za CRUD operace nad úkoly.

```typescript
interface TaskManager {
  // Vytvoření nového úkolu
  createTask(input: CreateTaskInput): Promise<Task>;

  // Získání úkolu podle ID
  getTask(taskId: string): Promise<Task | null>;

  // Aktualizace úkolu
  updateTask(taskId: string, update: Partial<Task>): Promise<Task>;

  // Zrušení úkolu
  cancelTask(taskId: string, reason: string): Promise<void>;

  // Seznam úkolů s filtrováním
  listTasks(filter: TaskFilter): Promise<PaginatedResult<Task>>;
}

interface CreateTaskInput {
  prompt: string;
  taskType: TaskType;
  config?: TaskConfig;
  parentTaskId?: string;
  priority?: number;
}
```

**Zodpovědnosti:**
- Validace vstupních dat
- Generování unikátních ID
- Persistence do databáze
- Emitování eventů při změnách

### 2. Task Scheduler

Plánuje a prioritizuje úkoly pro zpracování.

```typescript
interface TaskScheduler {
  // Naplánování úkolu
  schedule(task: Task): Promise<void>;

  // Prioritizace fronty
  prioritize(criteria: PriorityCriteria): Promise<void>;

  // Přidání do fronty
  enqueue(taskId: string, priority: number): Promise<void>;

  // Odebrání z fronty
  dequeue(): Promise<Task | null>;

  // Získání pozice ve frontě
  getQueuePosition(taskId: string): Promise<number>;
}

interface PriorityCriteria {
  maxConcurrent: number;
  providerAvailability: Map<string, boolean>;
  resourceLimits: ResourceLimits;
}
```

**Strategie prioritizace:**
1. **FIFO** - První dovnitř, první ven
2. **Priority-based** - Dle priority úkolu
3. **Resource-aware** - Dle dostupnosti zdrojů
4. **Fair-share** - Spravedlivé rozdělení mezi uživatele

### 3. Task Executor

Provádí úkoly pomocí agentů.

```typescript
interface TaskExecutor {
  // Spuštění úkolu
  execute(task: Task, worker: Worker): Promise<TaskResult>;

  // Monitorování průběhu
  monitor(taskId: string): AsyncIterable<TaskProgress>;

  // Opakování při selhání
  retry(taskId: string, checkpoint?: string): Promise<void>;

  // Rollback při kritické chybě
  rollback(taskId: string, toCheckpoint: string): Promise<void>;
}

interface TaskResult {
  success: boolean;
  output: TaskOutput;
  metrics: ExecutionMetrics;
  checkpoints: Checkpoint[];
}
```

**Execution Flow:**
```
1. Prepare workspace (git worktree)
2. Load checkpoint if resuming
3. Execute agent with task
4. Stream output to EventEmitter
5. Validate output (build, test, lint)
6. Create final checkpoint
7. Cleanup workspace
```

### 4. State Machine

Řídí životní cyklus úkolů.

```typescript
type TaskState =
  | 'pending'      // Čeká na zpracování
  | 'queued'       // Ve frontě
  | 'running'      // Probíhá
  | 'paused'       // Pozastaveno (HITL)
  | 'validating'   // Validace výstupu
  | 'completed'    // Úspěšně dokončeno
  | 'failed'       // Selhalo
  | 'cancelled'    // Zrušeno
  | 'timeout'      // Timeout
  | 'archived';    // Archivováno

interface StateMachine {
  transition(taskId: string, event: StateEvent): Promise<TaskState>;
  canTransition(from: TaskState, to: TaskState): boolean;
  getHistory(taskId: string): Promise<StateTransition[]>;
}

// Validní přechody
const transitions: Record<TaskState, TaskState[]> = {
  pending: ['queued', 'cancelled'],
  queued: ['running', 'cancelled', 'timeout'],
  running: ['paused', 'validating', 'failed', 'cancelled'],
  paused: ['running', 'cancelled'],
  validating: ['completed', 'failed', 'running'],
  completed: ['archived'],
  failed: ['queued', 'archived'],  // retry → queued
  cancelled: ['archived'],
  timeout: ['queued', 'archived'],
  archived: [],
};
```

### 5. Checkpoint Manager

Správa checkpointů pro recovery a HITL.

```typescript
interface CheckpointManager {
  // Vytvoření checkpointu
  create(taskId: string, data: CheckpointData): Promise<Checkpoint>;

  // Obnovení z checkpointu
  restore(checkpointId: string): Promise<CheckpointData>;

  // Seznam checkpointů pro úkol
  list(taskId: string): Promise<Checkpoint[]>;

  // Smazání starých checkpointů
  cleanup(olderThan: Date): Promise<number>;
}

interface CheckpointData {
  taskState: Partial<Task>;
  workspaceSnapshot: string;  // Git commit hash
  agentState?: unknown;
  metadata: Record<string, unknown>;
}
```

### 6. Event Emitter

Distribuce eventů v reálném čase.

```typescript
interface EventEmitter {
  // Emitování eventu
  emit(event: OrchestratorEvent): void;

  // Přihlášení k odběru
  subscribe(
    filter: EventFilter,
    handler: (event: OrchestratorEvent) => void
  ): Unsubscribe;

  // Broadcast všem subscribers
  broadcast(event: OrchestratorEvent): void;
}

type OrchestratorEvent =
  | TaskCreatedEvent
  | TaskStartedEvent
  | TaskProgressEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | CheckpointCreatedEvent
  | HITLRequiredEvent;
```

### 7. Metrics Collector

Sběr a agregace metrik.

```typescript
interface MetricsCollector {
  // Záznam metriky
  record(metric: Metric): void;

  // Agregace metrik
  aggregate(query: MetricQuery): Promise<AggregatedMetrics>;

  // Export pro Prometheus
  export(): string;
}

interface Metric {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: Date;
}

// Klíčové metriky
const metrics = {
  'ado_tasks_total': Counter,
  'ado_tasks_duration_seconds': Histogram,
  'ado_tasks_active': Gauge,
  'ado_queue_length': Gauge,
  'ado_checkpoints_total': Counter,
  'ado_provider_requests_total': Counter,
  'ado_cost_usd_total': Counter,
};
```

## Interní komunikace

```
┌──────────────┐         ┌──────────────┐
│ Task Manager │────────▶│Event Emitter │
└──────┬───────┘         └──────┬───────┘
       │                        │
       ▼                        ▼
┌──────────────┐         ┌──────────────┐
│  Scheduler   │◀───────▶│ State Machine│
└──────┬───────┘         └──────────────┘
       │                        ▲
       ▼                        │
┌──────────────┐         ┌──────────────┐
│   Executor   │────────▶│ Checkpoint   │
└──────────────┘         └──────────────┘
```

## Dependency Injection

```typescript
// Orchestrator factory
function createOrchestrator(deps: OrchestratorDeps): Orchestrator {
  const eventEmitter = new EventEmitter();
  const stateMachine = new StateMachine(deps.db);
  const checkpointManager = new CheckpointManager(deps.storage);
  const metricsCollector = new MetricsCollector();

  const taskManager = new TaskManager({
    db: deps.db,
    eventEmitter,
    stateMachine,
  });

  const taskScheduler = new TaskScheduler({
    queue: deps.queue,
    stateMachine,
    metricsCollector,
  });

  const taskExecutor = new TaskExecutor({
    agentRegistry: deps.agentRegistry,
    checkpointManager,
    eventEmitter,
    stateMachine,
  });

  return new Orchestrator({
    taskManager,
    taskScheduler,
    taskExecutor,
    eventEmitter,
    metricsCollector,
  });
}
```

## Error Handling

```typescript
// Hierarchie chyb
class OrchestratorError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean,
    public context?: unknown
  ) {
    super(message);
  }
}

class TaskNotFoundError extends OrchestratorError {
  constructor(taskId: string) {
    super(`Task ${taskId} not found`, 'TASK_NOT_FOUND', false);
  }
}

class InvalidStateTransitionError extends OrchestratorError {
  constructor(from: TaskState, to: TaskState) {
    super(
      `Invalid transition from ${from} to ${to}`,
      'INVALID_TRANSITION',
      false
    );
  }
}

class ExecutionError extends OrchestratorError {
  constructor(message: string, public checkpoint?: string) {
    super(message, 'EXECUTION_ERROR', true);
  }
}
```

---

## Souvislosti

- [Container Diagram](../02-container-diagram.md)
- [Agent Adapters](./agent-adapters.md)
- [Data Models: Entities](../04-data-models/entities.md)
- [tRPC API](../05-communication/trpc-api.md)

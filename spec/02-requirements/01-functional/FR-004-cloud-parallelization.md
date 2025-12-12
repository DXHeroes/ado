# FR-004: Cloud Parallelization

## Přehled

ADO musí umožnit paralelní provádění úkolů napříč více workery v cloudové infrastruktuře, s efektivním využitím zdrojů a koordinací mezi paralelními větvemi.

## Požadavky

### FR-004.1: Paralelní dekompozice

**Popis:** Systém identifikuje a vytváří paralelizovatelné podúkoly.

**Akceptační kritéria:**
- [ ] Automatická analýza závislostí mezi subtasky
- [ ] Vytvoření DAG (Directed Acyclic Graph) úkolů
- [ ] Identifikace kritické cesty
- [ ] Maximalizace paralelismu při respektování závislostí
- [ ] Vizualizace task graph

**DAG příklad:**
```
        ┌─────────────┐
        │   Spec      │
        │  (Claude)   │
        └──────┬──────┘
               │
       ┌───────┴───────┐
       │               │
       ▼               ▼
┌─────────────┐ ┌─────────────┐
│  Model      │ │  Auth       │
│  (Gemini)   │ │  (Claude)   │
└──────┬──────┘ └──────┬──────┘
       │               │
       └───────┬───────┘
               │
               ▼
        ┌─────────────┐
        │   API       │
        │  (Claude)   │
        └──────┬──────┘
               │
       ┌───────┴───────┐
       │               │
       ▼               ▼
┌─────────────┐ ┌─────────────┐
│  Unit Tests │ │  Int Tests  │
│  (Cursor)   │ │  (Gemini)   │
└─────────────┘ └─────────────┘
```

### FR-004.2: Multi-worker execution

**Popis:** Paralelní subtasky běží současně na různých workerech.

**Akceptační kritéria:**
- [ ] Scheduler přiřazuje subtasky volným workerům
- [ ] Load balancing podle kapacity workerů
- [ ] Respektování závislostí (barrier synchronization)
- [ ] Work stealing pro lepší využití zdrojů
- [ ] Monitoring vytížení workerů

**Scheduling algoritmus:**
```typescript
interface Scheduler {
  // Získá další úkol pro worker
  getNextTask(workerId: string): Promise<Subtask | null>;

  // Oznámí dokončení úkolu
  completeTask(workerId: string, taskId: string, result: Result): Promise<void>;

  // Získá stav fronty
  getQueueStatus(): Promise<QueueStatus>;
}

interface QueueStatus {
  pending: number;
  running: number;
  completed: number;
  blocked: number;  // Čeká na závislosti
  workers: WorkerStatus[];
}
```

### FR-004.3: Git worktree isolation

**Popis:** Každý paralelní subtask pracuje v izolovaném Git worktree.

**Akceptační kritéria:**
- [ ] Automatické vytvoření worktree pro každý subtask
- [ ] Izolované změny bez konfliktů
- [ ] Automatic merge po dokončení
- [ ] Conflict detection a resolution
- [ ] Cleanup worktrees po dokončení

**Worktree flow:**
```
main branch
     │
     ├── worktree-1 (Model implementation)
     │         │
     │         └── merge ───────┐
     │                          │
     ├── worktree-2 (Auth)      │
     │         │                │
     │         └── merge ───────┤
     │                          │
     └──────────────────────────┴── Unified changes
```

### FR-004.4: Result aggregation

**Popis:** Výsledky paralelních subtasků jsou agregovány do jednotného výstupu.

**Akceptační kritéria:**
- [ ] Collecting outputs z všech workerů
- [ ] Merge kódu z různých worktrees
- [ ] Agregace metrik (čas, cost, coverage)
- [ ] Unified test report
- [ ] Conflict resolution při merge

**Agregace:**
```typescript
interface AggregatedResult {
  taskId: string;
  status: 'success' | 'partial' | 'failed';

  // Merged outputs
  changes: FileChange[];
  conflicts: Conflict[];

  // Aggregated metrics
  metrics: {
    totalDuration: number;
    parallelizationFactor: number;  // Speedup vs sequential
    totalCost: number;
    coverageOverall: number;
  };

  // Per-subtask results
  subtasks: SubtaskResult[];
}
```

### FR-004.5: Failure isolation

**Popis:** Selhání jednoho paralelního subtasku neovlivní ostatní.

**Akceptační kritéria:**
- [ ] Izolace failures (blast radius)
- [ ] Retry pouze pro failed subtask
- [ ] Možnost partial completion
- [ ] Reporting per-subtask status
- [ ] Rollback při kritickém selhání

**Failure handling:**
```
Subtask A: ✓ Success
Subtask B: ✗ Failed (1st attempt)
           ↓
           Retry (2nd attempt)
           ↓
           ✓ Success
Subtask C: ✓ Success

Overall: ✓ Success (with retry)
```

### FR-004.6: Resource optimization

**Popis:** Systém optimalizuje využití zdrojů při paralelním provádění.

**Akceptační kritéria:**
- [ ] Agent selection based on availability
- [ ] Cost-aware scheduling (subscription first)
- [ ] Rate limit distribution across workers
- [ ] Memory-efficient large task handling
- [ ] Network bandwidth consideration

**Optimization strategie:**
```yaml
parallelization:
  strategy: "balanced"  # balanced | speed | cost

  balanced:
    maxConcurrency: 10
    preferSubscription: true
    distributeRateLimits: true

  speed:
    maxConcurrency: 50
    allowApiOverage: true

  cost:
    maxConcurrency: 5
    subscriptionOnly: true
    waitForRateLimit: true
```

### FR-004.7: Progress tracking

**Popis:** Real-time sledování postupu všech paralelních větví.

**Akceptační kritéria:**
- [ ] Agregovaný progress (celkový %)
- [ ] Per-subtask progress
- [ ] ETA calculation
- [ ] Critical path highlighting
- [ ] Visual progress (CLI + dashboard)

**Progress UI:**
```
Task: Create E-commerce API
Overall: ████████░░░░░░░░ 52% | ETA: 8 min

Subtasks:
├── [✓] Specification          100% | 2m 15s
├── [▶] Product model           75% | 1m 30s (Worker-1)
├── [▶] Order model             60% | 1m 45s (Worker-2)  ← Critical path
├── [▶] Auth module             80% | 1m 10s (Worker-3)
├── [⏸] API routes              0%  | Waiting for dependencies
└── [⏸] Tests                   0%  | Waiting for dependencies
```

---

## Konfigurace

```yaml
parallelization:
  enabled: true
  maxWorkers: 20
  maxConcurrentSubtasks: 10

  scheduling:
    algorithm: "dependency-aware"  # fifo | priority | dependency-aware
    workStealing: true
    loadBalancing: true

  isolation:
    type: "worktree"  # worktree | docker | none
    cleanupAfter: true
    keepOnFailure: false

  aggregation:
    mergeStrategy: "auto"  # auto | manual | disabled
    conflictResolution: "prompt"  # prompt | ours | theirs

  optimization:
    preferSubscription: true
    distributeRateLimits: true
    maxCostPerTask: 50.00
```

---

## Souvislosti

- [FR-002: Distributed Orchestration](./FR-002-distributed-orchestration.md)
- [Architecture: Component Diagrams](../../03-architecture/03-component-diagrams/)
- [Design: Remote Execution](../../04-design/01-distributed-system/remote-execution.md)

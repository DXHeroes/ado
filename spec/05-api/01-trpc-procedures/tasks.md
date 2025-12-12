# Tasks tRPC Procedures

## Přehled

Dokumentace všech tRPC procedur pro správu úkolů (tasks).

## Procedures

### tasks.create

Vytvoření nového úkolu.

**Type:** Mutation (protected)

**Input:**
```typescript
{
  prompt: string;           // Popis úkolu
  projectId: string;        // ID projektu
  repositoryPath: string;   // Cesta k repozitáři
  taskType: 'greenfield' | 'feature' | 'bugfix' | 'refactor';

  // Volitelné
  hitlPolicy?: 'autonomous' | 'spec-review' | 'review-major' | 'review-all';
  providers?: string[];          // Preferovaní poskytovatelé
  excludeProviders?: string[];   // Vyloučení poskytovatelé
  maxCost?: number;              // Max. náklady (USD)
  qualityGates?: {
    build?: boolean;
    tests?: boolean;
    lint?: boolean;
    coverage?: number;
  };
  priority?: 'low' | 'normal' | 'high';
  tags?: string[];
}
```

**Output:**
```typescript
{
  id: string;
  status: 'queued';
  createdAt: string;
  estimatedDuration: number;  // minuty
  estimatedCost: number;      // USD
  queuePosition: number;
}
```

**Příklad:**
```typescript
const task = await trpc.tasks.create.mutate({
  prompt: "Implementuj REST API pro správu uživatelů s JWT autentizací",
  projectId: "my-project",
  repositoryPath: "/home/user/projects/my-app",
  taskType: "feature",
  hitlPolicy: "spec-review",
  qualityGates: {
    build: true,
    tests: true,
    coverage: 80
  }
});
// task.id = "task-abc123"
```

---

### tasks.get

Získání detailů úkolu.

**Type:** Query (public)

**Input:** `string` (task ID)

**Output:**
```typescript
{
  id: string;
  prompt: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

  // Progress
  progress: number;          // 0-100
  currentStep: string;

  // Subtasks
  subtasks: Array<{
    id: string;
    name: string;
    status: string;
    progress: number;
  }>;

  // Timing
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  estimatedRemaining: number | null;

  // Result
  result: TaskResult | null;
  error: string | null;

  // Metadata
  provider: string | null;
  workerId: string | null;
  cost: number;
  checkpoints: string[];
}
```

---

### tasks.list

Výpis úkolů s filtrováním.

**Type:** Query (public)

**Input:**
```typescript
{
  status?: 'queued' | 'running' | 'completed' | 'failed';
  projectId?: string;
  providerId?: string;
  tags?: string[];
  from?: string;      // ISO date
  to?: string;        // ISO date
  limit?: number;     // default: 20, max: 100
  offset?: number;    // default: 0
  orderBy?: 'createdAt' | 'updatedAt' | 'status';
  order?: 'asc' | 'desc';
}
```

**Output:**
```typescript
{
  items: Task[];
  total: number;
  hasMore: boolean;
}
```

---

### tasks.cancel

Zrušení běžícího úkolu.

**Type:** Mutation (protected)

**Input:** `string` (task ID)

**Output:**
```typescript
{
  success: boolean;
  message: string;
}
```

**Chování:**
- `queued` → Odstraněn z fronty
- `running` → Graceful stop, cleanup
- `completed/failed/cancelled` → Error (already terminated)

---

### tasks.pause

Pozastavení úkolu.

**Type:** Mutation (protected)

**Input:** `string` (task ID)

**Output:**
```typescript
{
  success: boolean;
  checkpointId: string;  // Pro resume
}
```

---

### tasks.resume

Obnovení pozastaveného úkolu.

**Type:** Mutation (protected)

**Input:**
```typescript
{
  taskId: string;
  feedback?: string;        // Uživatelský feedback
  modifications?: object;   // Změny kontextu
}
```

**Output:**
```typescript
{
  success: boolean;
  resumedFrom: string;  // checkpoint ID
}
```

---

### tasks.retry

Opakování neúspěšného úkolu.

**Type:** Mutation (protected)

**Input:**
```typescript
{
  taskId: string;
  fromCheckpoint?: string;  // Konkrétní checkpoint
  modifications?: object;   // Změny konfigurace
}
```

**Output:**
```typescript
{
  newTaskId: string;
  status: 'queued';
}
```

---

## Error Codes

| Code | Meaning |
|------|---------|
| `TASK_NOT_FOUND` | Úkol neexistuje |
| `TASK_ALREADY_RUNNING` | Úkol již běží |
| `TASK_ALREADY_COMPLETED` | Úkol již dokončen |
| `INVALID_STATE_TRANSITION` | Neplatný přechod stavu |
| `QUEUE_FULL` | Fronta je plná |
| `COST_LIMIT_EXCEEDED` | Překročen limit nákladů |
| `NO_AVAILABLE_PROVIDER` | Žádný dostupný poskytovatel |

---

## Souvislosti

- [Architecture: tRPC API](../../03-architecture/05-communication/trpc-api.md)
- [WebSocket Events: Task Events](../02-websocket-events/task-events.md)

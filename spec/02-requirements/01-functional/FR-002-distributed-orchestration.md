# FR-002: Distribuovaná orchestrace

## Přehled

ADO musí umožnit ovládání AI agentů běžících na vzdálené infrastruktuře (Kubernetes, Docker, Coolify, EC2) z lokálního počítače, s real-time streamingem výstupů a plnou kontrolou nad prováděním.

## Požadavky

### FR-002.1: Lokální kontrolér

**Popis:** CLI na lokálním PC funguje jako kontrolní bod pro vzdálené agenty.

**Akceptační kritéria:**
- [ ] `ado run --remote` spustí úkol na vzdálené infrastruktuře
- [ ] CLI zobrazuje real-time progress
- [ ] CLI umožňuje přerušení/pokračování vzdáleného úkolu
- [ ] Funguje i při nestabilním připojení (reconnect)
- [ ] Podporuje odpojení a pozdější připojení k běžícímu úkolu

**Příklad:**
```bash
# Spuštění na vzdálené infrastruktuře
ado run "Complex task" --remote --workers 5

# Připojení k běžícímu úkolu
ado attach task-123

# Odpojení bez zastavení
ado detach task-123
```

### FR-002.2: Cloud workery

**Popis:** Agenti běží jako workery v cloudové infrastruktuře.

**Akceptační kritéria:**
- [ ] Worker je samostatná jednotka schopná provádět úkoly
- [ ] Worker má přístup ke všem potřebným AI agentům
- [ ] Worker reportuje status kontroléru
- [ ] Worker podporuje graceful shutdown
- [ ] Worker může být horizontálně škálován

**Worker specifikace:**
```yaml
worker:
  image: "ado-worker:latest"
  resources:
    cpu: "2"
    memory: "4Gi"
  capabilities:
    - claude-code
    - gemini-cli
    - cursor-cli
  healthCheck:
    endpoint: "/health"
    interval: 30s
```

### FR-002.3: tRPC komunikace

**Popis:** Komunikace mezi CLI a kontrolérem probíhá přes type-safe tRPC.

**Akceptační kritéria:**
- [ ] Všechny API calls jsou type-safe
- [ ] Podporuje queries, mutations, subscriptions
- [ ] Automatické reconnect při výpadku
- [ ] Komprese pro velké payloady
- [ ] Autentizace a autorizace

**tRPC router struktura:**
```typescript
const appRouter = router({
  // Queries
  tasks: {
    list: publicProcedure.query(...),
    get: publicProcedure.input(z.string()).query(...),
    status: publicProcedure.input(z.string()).query(...),
  },

  // Mutations
  task: {
    create: protectedProcedure.input(TaskInput).mutation(...),
    cancel: protectedProcedure.input(z.string()).mutation(...),
    pause: protectedProcedure.input(z.string()).mutation(...),
    resume: protectedProcedure.input(z.string()).mutation(...),
  },

  // Subscriptions
  stream: {
    taskProgress: publicProcedure.input(z.string()).subscription(...),
    taskOutput: publicProcedure.input(z.string()).subscription(...),
    systemEvents: publicProcedure.subscription(...),
  },
});
```

### FR-002.4: WebSocket streaming

**Popis:** Real-time streaming výstupů z agentů přes WebSocket.

**Akceptační kritéria:**
- [ ] Streamování stdout/stderr z agentů
- [ ] Streamování progress eventů
- [ ] Minimální latence (< 100ms)
- [ ] Buffering pro vysoký throughput
- [ ] Podpora pro více současných streamů

**Event typy:**
```typescript
type TaskEvent =
  | { type: 'started'; taskId: string; workerId: string }
  | { type: 'progress'; taskId: string; percent: number; message: string }
  | { type: 'output'; taskId: string; stream: 'stdout' | 'stderr'; data: string }
  | { type: 'checkpoint'; taskId: string; checkpointId: string }
  | { type: 'hitl_required'; taskId: string; reason: string; options: string[] }
  | { type: 'completed'; taskId: string; result: TaskResult }
  | { type: 'failed'; taskId: string; error: string };
```

### FR-002.5: State synchronizace

**Popis:** Stav úkolů je synchronizován mezi kontrolérem a workery.

**Akceptační kritéria:**
- [ ] Centrální state store (PostgreSQL)
- [ ] Workery reportují změny stavu
- [ ] Kontrolér agreguje stav ze všech workerů
- [ ] Conflict resolution při souběžných změnách
- [ ] State je perzistentní a obnovitelný

**State model:**
```typescript
interface DistributedTaskState {
  taskId: string;
  status: TaskStatus;
  workerId: string | null;

  // Progress tracking
  progress: number;
  currentStep: string;

  // Checkpointing
  lastCheckpoint: string | null;
  checkpointData: Record<string, unknown>;

  // Timing
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;

  // Result
  result: TaskResult | null;
  error: string | null;
}
```

### FR-002.6: Failure handling

**Popis:** Systém gracefully zvládá selhání workerů a síťové problémy.

**Akceptační kritéria:**
- [ ] Detekce mrtvých workerů (heartbeat)
- [ ] Automatické přeřazení úkolu na jiného workera
- [ ] Obnovení z posledního checkpointu
- [ ] Exponential backoff pro retries
- [ ] Circuit breaker pro opakující se selhání

**Failure recovery flow:**
```
Worker dies
    │
    ▼
Controller detects (heartbeat timeout)
    │
    ▼
Load last checkpoint
    │
    ▼
Assign to available worker
    │
    ▼
Resume from checkpoint
    │
    ▼
Continue execution
```

### FR-002.7: Škálování workerů

**Popis:** Počet workerů lze dynamicky škálovat podle potřeby.

**Akceptační kritéria:**
- [ ] Manuální škálování přes CLI
- [ ] Automatické škálování na základě fronty
- [ ] Scale-to-zero když není práce
- [ ] Warmup time tracking
- [ ] Resource limits per worker

**Příklad:**
```bash
# Manuální škálování
ado workers scale 10

# Automatické škálování
ado workers autoscale --min 2 --max 20 --target-queue 5
```

---

## Architektura

```
┌──────────────────────────────────────────────────────────────┐
│                        LOKÁLNÍ PC                             │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  ADO CLI                                                │  │
│  │  - tRPC client                                          │  │
│  │  - WebSocket subscription                               │  │
│  │  - Local state cache                                    │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                              │
                         tRPC + WS
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    CLOUD INFRASTRUCTURE                       │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  ADO Controller                                         │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │ tRPC Server  │  │ Task Queue   │  │ State Store  │  │  │
│  │  │ + WebSocket  │  │ (Redis)      │  │ (PostgreSQL) │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
│                              │                                │
│              ┌───────────────┼───────────────┐               │
│              │               │               │               │
│              ▼               ▼               ▼               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  Worker 1    │  │  Worker 2    │  │  Worker N    │       │
│  │  (K8s Pod)   │  │  (K8s Pod)   │  │  (K8s Pod)   │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└──────────────────────────────────────────────────────────────┘
```

---

## Konfigurace

```yaml
distributed:
  enabled: true

  controller:
    url: "https://ado.example.com"
    auth:
      type: "api-key"
      key: ${ADO_API_KEY}

  communication:
    protocol: "trpc"
    websocket: true
    reconnectInterval: 5000
    heartbeatInterval: 30000

  workers:
    default: 3
    min: 1
    max: 50
    autoscale:
      enabled: true
      targetQueueLength: 10
      scaleUpCooldown: 60
      scaleDownCooldown: 300

  failover:
    heartbeatTimeout: 60000
    maxRetries: 3
    checkpointInterval: 30000
```

---

## Souvislosti

- [FR-004: Cloud Parallelization](./FR-004-cloud-parallelization.md)
- [Architecture: Container Diagram](../../03-architecture/02-container-diagram.md)
- [Design: Cloud Agent Controller](../../04-design/01-distributed-system/cloud-agent-controller.md)
- [API: tRPC Procedures](../../05-api/01-trpc-procedures/tasks.md)

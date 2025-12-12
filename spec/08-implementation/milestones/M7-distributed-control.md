# Milestone 7: Distributed Control

## Cíl

Umožnit ovládání AI agentů běžících na vzdálené infrastruktuře z lokálního CLI.

## Scope

### In Scope
- tRPC server a client implementace
- WebSocket subscription layer
- Remote worker spawning (K8s)
- State synchronization
- CLI remote execution support
- Basic health monitoring

### Out of Scope
- Full auto-scaling (M9)
- Multi-region support
- Advanced failure recovery

## Tasks

| ID | Task | Popis | Závislosti |
|----|------|-------|------------|
| M7.1 | tRPC Server | Implementace tRPC routeru na API Gateway | - |
| M7.2 | tRPC Client | Implementace tRPC klienta v CLI | M7.1 |
| M7.3 | WebSocket Layer | Subscriptions pro real-time streaming | M7.1 |
| M7.4 | Worker Protocol | Komunikační protokol mezi controller a worker | M7.1 |
| M7.5 | K8s Spawner | Spawning workerů jako K8s pods | M7.4 |
| M7.6 | State Sync | Synchronizace stavu přes PostgreSQL | M7.4 |
| M7.7 | CLI --remote | Přidání --remote flag do CLI | M7.2, M7.3 |
| M7.8 | Health Monitor | Basic health checking workerů | M7.4 |

## Deliverables

### 1. tRPC Router (M7.1)

```typescript
// packages/api/src/router/index.ts
export const appRouter = router({
  tasks: taskRouter,
  workers: workerRouter,
  stream: streamRouter,
});
```

### 2. CLI Remote Mode (M7.7)

```bash
# Spuštění na remote infrastructure
ado run "task" --remote

# S konkrétním počtem workerů
ado run "task" --remote --workers 5

# Připojení k běžícímu tasku
ado attach task-123

# Status remote workerů
ado workers status
```

### 3. Worker Lifecycle

```
CLI Command
    │
    ▼
┌─────────────┐
│ API Gateway │
│ (tRPC)      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│Orchestrator │
│             │
│ Spawn worker│
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ K8s API     │
│             │
│ Create Pod  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Worker    │
│   (Pod)     │
│             │
│ Register    │
│ Execute     │
│ Report      │
└─────────────┘
```

## Acceptance Criteria

- [ ] `ado run --remote` spouští task na vzdálené infrastruktuře
- [ ] Real-time progress streaming přes WebSocket
- [ ] CLI zobrazuje output ze vzdáleného workeru
- [ ] Worker se registruje u controlleru
- [ ] Health check detekuje dead workery
- [ ] Task se přeřadí při selhání workeru
- [ ] `ado workers status` zobrazuje stav workerů
- [ ] Latence streaming < 100ms

## Technical Notes

### tRPC Setup

```typescript
// Server
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { applyWSSHandler } from '@trpc/server/adapters/ws';

const server = createHTTPServer({
  router: appRouter,
  createContext,
});

const wss = new WebSocketServer({ server: server.server });
applyWSSHandler({ wss, router: appRouter, createContext });
```

### Worker Registration

```typescript
// Worker startup
async function register() {
  await controller.workers.register.mutate({
    workerId: process.env.WORKER_ID,
    capabilities: ['claude-code', 'gemini-cli'],
    resources: {
      cpu: os.cpus().length,
      memory: os.totalmem()
    }
  });
}
```

## Testing

### Unit Tests
- tRPC router procedures
- Worker protocol messages
- State sync logic

### Integration Tests
- CLI → API → Worker flow
- WebSocket reconnection
- Task reassignment on worker failure

### E2E Tests
- Full remote execution flow
- Multi-worker coordination

## Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| WebSocket instability | Medium | High | Reconnection logic, buffering |
| K8s API rate limits | Low | Medium | Batch operations |
| State sync conflicts | Medium | Medium | Optimistic locking |

## Timeline

| Week | Focus |
|------|-------|
| 1 | M7.1, M7.2, M7.3 |
| 2 | M7.4, M7.5 |
| 3 | M7.6, M7.7 |
| 4 | M7.8, Testing, Polish |

---

## Souvislosti

- [FR-002: Distributed Orchestration](../../02-requirements/01-functional/FR-002-distributed-orchestration.md)
- [Architecture: tRPC API](../../03-architecture/05-communication/trpc-api.md)
- [Design: Cloud Agent Controller](../../04-design/01-distributed-system/cloud-agent-controller.md)

# ADR-003: WebSocket Subscriptions pro Real-time Streaming

## Status

**Accepted**

## Context

ADO v2 potřebuje mechanismus pro real-time streaming dat mezi:
- CLI ↔ API Gateway (progress, output agentů)
- Dashboard ↔ API Gateway (live updates)
- Controller ↔ Workers (state synchronizace)

Požadavky:
- Nízká latence (<100ms)
- Bidirectional komunikace
- Podpora pro reconnection
- Type-safe na obou koncích
- Škálovatelnost pro stovky současných připojení

### Zvažované alternativy

#### 1. Server-Sent Events (SSE)
**Výhody:**
- Jednoduchá implementace
- Nativní podpora v prohlížečích
- HTTP-based (firewall friendly)

**Nevýhody:**
- Pouze server → client (unidirectional)
- Omezené možnosti pro binary data
- Reconnection logic na klientovi

#### 2. Long Polling
**Výhody:**
- Funguje všude
- Žádné speciální protokoly

**Nevýhody:**
- Vysoká latence
- Zbytečný overhead
- Obtížná implementace real-time

#### 3. WebSocket
**Výhody:**
- True bidirectional
- Nízká latence
- Efektivní pro časté malé zprávy
- Podpora binary dat

**Nevýhody:**
- Komplexnější implementace
- Potřeba reconnection logic
- Některé proxy/firewally mohou blokovat

#### 4. WebSocket + tRPC Subscriptions
**Výhody:**
- Type-safe end-to-end
- Integrované s tRPC routerem
- Automatic reconnection (s @trpc/client)
- Konzistentní API s HTTP procedurami

**Nevýhody:**
- Závislost na tRPC ekosystému
- Větší bundle size

## Decision

**Používáme WebSocket s tRPC subscriptions** pro všechnu real-time komunikaci.

### Důvody

1. **Type Safety**: Subscriptions jsou definovány ve stejném routeru jako queries/mutations
2. **Konzistence**: Jednotné API pro všechny operace
3. **DX**: Automatic reconnection, backpressure handling
4. **Integrace**: Nativní podpora v @trpc/client a @trpc/react-query

## Implementation

### Server Setup

```typescript
// packages/api/src/ws.ts
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import { appRouter } from './router';
import { createContext } from './context';

const wss = new WebSocketServer({ port: 3001 });

applyWSSHandler({
  wss,
  router: appRouter,
  createContext,
  // Keepalive pro detekci mrtvých spojení
  keepAlive: {
    enabled: true,
    pingMs: 30000,
    pongWaitMs: 5000,
  },
});
```

### Subscription Definition

```typescript
// packages/api/src/router/stream.ts
import { observable } from '@trpc/server/observable';

export const streamRouter = router({
  // Task progress subscription
  onTaskProgress: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .subscription(({ input, ctx }) => {
      return observable<TaskProgressEvent>((emit) => {
        const handler = (event: TaskProgressEvent) => {
          if (event.taskId === input.taskId) {
            emit.next(event);
          }
        };

        ctx.events.on('task.progress', handler);

        return () => {
          ctx.events.off('task.progress', handler);
        };
      });
    }),

  // Agent output streaming
  onAgentOutput: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .subscription(({ input, ctx }) => {
      return observable<AgentOutputEvent>((emit) => {
        const handler = (event: AgentOutputEvent) => {
          if (event.taskId === input.taskId) {
            emit.next(event);
          }
        };

        ctx.events.on('agent.output', handler);

        return () => {
          ctx.events.off('agent.output', handler);
        };
      });
    }),

  // Global system events
  onSystemEvent: publicProcedure
    .subscription(({ ctx }) => {
      return observable<SystemEvent>((emit) => {
        const handler = (event: SystemEvent) => {
          emit.next(event);
        };

        ctx.events.on('system.*', handler);

        return () => {
          ctx.events.off('system.*', handler);
        };
      });
    }),
});
```

### Client Usage (CLI)

```typescript
// packages/cli/src/client.ts
import { createTRPCClient, createWSClient, wsLink } from '@trpc/client';
import type { AppRouter } from '@ado/api';

const wsClient = createWSClient({
  url: 'ws://localhost:3001',
  retryDelayMs: () => 1000,
  onClose: (cause) => {
    console.error('WebSocket closed:', cause);
  },
});

export const trpc = createTRPCClient<AppRouter>({
  links: [wsLink({ client: wsClient })],
});

// Subscribe to task progress
const subscription = trpc.stream.onTaskProgress.subscribe(
  { taskId: 'task-123' },
  {
    onData: (event) => {
      renderProgress(event);
    },
    onError: (err) => {
      console.error('Subscription error:', err);
    },
    onComplete: () => {
      console.log('Task completed');
    },
  }
);

// Cleanup
subscription.unsubscribe();
```

### Client Usage (React Dashboard)

```typescript
// packages/dashboard/src/hooks/useTaskProgress.ts
import { trpc } from '../utils/trpc';

export function useTaskProgress(taskId: string) {
  const [progress, setProgress] = useState<TaskProgress | null>(null);

  trpc.stream.onTaskProgress.useSubscription(
    { taskId },
    {
      onData: (event) => {
        setProgress(event);
      },
      onError: (err) => {
        console.error('Subscription error:', err);
      },
    }
  );

  return progress;
}
```

### Event Types

```typescript
// packages/shared/src/events.ts

// Task events
interface TaskProgressEvent {
  taskId: string;
  phase: 'spec' | 'impl' | 'test' | 'validate';
  progress: number; // 0-100
  message: string;
  timestamp: Date;
}

interface TaskCompletedEvent {
  taskId: string;
  status: 'completed' | 'failed';
  duration: number;
  artifacts: Artifact[];
}

// Agent events
interface AgentOutputEvent {
  taskId: string;
  agentId: string;
  type: 'stdout' | 'stderr' | 'tool_call' | 'tool_result';
  content: string;
  timestamp: Date;
}

// System events
interface SystemEvent {
  type: 'worker.added' | 'worker.removed' | 'provider.status';
  payload: unknown;
  timestamp: Date;
}
```

### Scaling Considerations

```typescript
// Redis Pub/Sub pro multi-instance scaling
import { createClient } from 'redis';

const publisher = createClient();
const subscriber = createClient();

// Publish events to Redis
events.on('*', (event) => {
  publisher.publish('ado:events', JSON.stringify(event));
});

// Subscribe to Redis and emit locally
subscriber.subscribe('ado:events', (message) => {
  const event = JSON.parse(message);
  localEvents.emit(event.type, event);
});
```

## Consequences

### Positive

- **Real-time UX**: Okamžitá zpětná vazba pro uživatele
- **Type Safety**: Compile-time kontrola event typů
- **Efficiency**: Nízký overhead pro časté malé zprávy
- **Scalability**: S Redis pub/sub škáluje horizontálně

### Negative

- **Complexity**: Potřeba spravovat WebSocket životní cyklus
- **Infrastructure**: Potřeba sticky sessions nebo Redis pub/sub
- **Debugging**: Těžší debugování než HTTP requesty

### Neutral

- **Bundle size**: ~15KB navíc pro WebSocket klienta
- **Browser support**: Všechny moderní prohlížeče podporují

## Monitoring

```typescript
// Metriky pro WebSocket
const wsMetrics = {
  connections: new Gauge('ado_ws_connections_total'),
  messagesIn: new Counter('ado_ws_messages_in_total'),
  messagesOut: new Counter('ado_ws_messages_out_total'),
  errors: new Counter('ado_ws_errors_total'),
  latency: new Histogram('ado_ws_latency_seconds'),
};
```

## Alternatives Considered for Future

- **WebTransport**: Pro ještě nižší latenci (když bude širší podpora)
- **gRPC Streaming**: Pro vyšší throughput binary dat

---

## Souvislosti

- [ADR-001: tRPC over REST](./ADR-001-trpc-over-rest.md)
- [Architecture: WebSocket Streaming](../05-communication/websocket-streaming.md)
- [API: Task Events](../../05-api/02-websocket-events/task-events.md)
- [API: Agent Events](../../05-api/02-websocket-events/agent-events.md)

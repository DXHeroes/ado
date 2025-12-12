# tRPC Procedures: Agents

## Přehled

API procedury pro správu AI agentů (instancí běžících na workerech).

## Router Definition

```typescript
// packages/api/src/router/agents.ts
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { z } from 'zod';

export const agentRouter = router({
  // Queries
  list: protectedProcedure
    .input(AgentListInput)
    .query(async ({ ctx, input }) => { /* ... */ }),

  get: protectedProcedure
    .input(z.object({ agentId: z.string() }))
    .query(async ({ ctx, input }) => { /* ... */ }),

  getCapabilities: publicProcedure
    .input(z.object({ providerId: z.string() }))
    .query(async ({ ctx, input }) => { /* ... */ }),

  // Mutations
  spawn: protectedProcedure
    .input(SpawnAgentInput)
    .mutation(async ({ ctx, input }) => { /* ... */ }),

  terminate: protectedProcedure
    .input(z.object({ agentId: z.string() }))
    .mutation(async ({ ctx, input }) => { /* ... */ }),

  interrupt: protectedProcedure
    .input(z.object({ agentId: z.string() }))
    .mutation(async ({ ctx, input }) => { /* ... */ }),

  sendInput: protectedProcedure
    .input(AgentInputMessage)
    .mutation(async ({ ctx, input }) => { /* ... */ }),

  // Subscriptions
  onOutput: protectedProcedure
    .input(z.object({ agentId: z.string() }))
    .subscription(({ ctx, input }) => { /* ... */ }),

  onStateChange: protectedProcedure
    .input(z.object({ agentId: z.string() }))
    .subscription(({ ctx, input }) => { /* ... */ }),
});
```

## Queries

### agents.list

Vrátí seznam aktivních agentů.

```typescript
// Input
const AgentListInput = z.object({
  workerId: z.string().optional(),
  taskId: z.string().optional(),
  providerId: z.string().optional(),
  status: z.enum(['idle', 'busy', 'terminating']).optional(),
  limit: z.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

// Output
interface AgentListOutput {
  agents: Agent[];
  nextCursor?: string;
  total: number;
}

interface Agent {
  id: string;
  providerId: string;
  workerId: string;
  taskId?: string;
  status: 'idle' | 'busy' | 'terminating';
  capabilities: AgentCapabilities;
  accessMode: 'subscription' | 'api' | 'free';
  startedAt: Date;
  lastActivityAt: Date;
  metrics: {
    tokensUsed: number;
    toolCalls: number;
    duration: number;
  };
}
```

**Příklad:**

```typescript
// CLI
const { agents } = await trpc.agents.list.query({
  status: 'busy',
  limit: 10,
});

console.log(`${agents.length} busy agents`);
agents.forEach(a => {
  console.log(`  ${a.id}: ${a.providerId} on ${a.workerId}`);
});
```

### agents.get

Vrátí detail konkrétního agenta.

```typescript
// Input
z.object({
  agentId: z.string(),
});

// Output
interface AgentDetail extends Agent {
  currentTask?: {
    id: string;
    prompt: string;
    startedAt: Date;
  };
  history: AgentEvent[];
  resources: {
    cpuUsage: number;
    memoryUsage: number;
  };
}
```

**Příklad:**

```typescript
const agent = await trpc.agents.get.query({
  agentId: 'agent-abc123',
});

console.log(`Agent ${agent.id}`);
console.log(`  Provider: ${agent.providerId}`);
console.log(`  Status: ${agent.status}`);
console.log(`  Tokens used: ${agent.metrics.tokensUsed}`);
```

### agents.getCapabilities

Vrátí capabilities pro daného providera.

```typescript
// Input
z.object({
  providerId: z.string(),
});

// Output
interface AgentCapabilities {
  maxContextTokens: number;
  supportedLanguages: string[];
  supportedFrameworks: string[];
  features: {
    codeGeneration: boolean;
    codeReview: boolean;
    testing: boolean;
    documentation: boolean;
    refactoring: boolean;
    debugging: boolean;
  };
  tools: string[];
  limitations: string[];
}
```

**Příklad:**

```typescript
const caps = await trpc.agents.getCapabilities.query({
  providerId: 'claude-code',
});

console.log(`Max context: ${caps.maxContextTokens} tokens`);
console.log(`Features: ${Object.entries(caps.features)
  .filter(([_, v]) => v)
  .map(([k]) => k)
  .join(', ')}`);
```

## Mutations

### agents.spawn

Spustí nového agenta na workeru.

```typescript
// Input
const SpawnAgentInput = z.object({
  providerId: z.string(),
  workerId: z.string().optional(), // Auto-select if not provided
  taskId: z.string().optional(),
  config: z.object({
    accessMode: z.enum(['subscription', 'api']).optional(),
    contextFile: z.string().optional(),
    environment: z.record(z.string()).optional(),
    timeout: z.number().optional(),
  }).optional(),
});

// Output
interface SpawnAgentOutput {
  agent: Agent;
  worker: {
    id: string;
    hostname: string;
  };
}
```

**Příklad:**

```typescript
const { agent, worker } = await trpc.agents.spawn.mutate({
  providerId: 'claude-code',
  config: {
    accessMode: 'subscription',
    contextFile: 'CLAUDE.md',
  },
});

console.log(`Spawned agent ${agent.id} on worker ${worker.id}`);
```

### agents.terminate

Ukončí běžícího agenta.

```typescript
// Input
z.object({
  agentId: z.string(),
  force: z.boolean().default(false),
  reason: z.string().optional(),
});

// Output
interface TerminateAgentOutput {
  success: boolean;
  agent: Agent;
  finalMetrics: {
    totalTokens: number;
    totalDuration: number;
    cost: number;
  };
}
```

**Příklad:**

```typescript
const result = await trpc.agents.terminate.mutate({
  agentId: 'agent-abc123',
  reason: 'Task completed',
});

console.log(`Agent terminated. Cost: $${result.finalMetrics.cost}`);
```

### agents.interrupt

Přeruší aktuální operaci agenta (zachová agenta živého).

```typescript
// Input
z.object({
  agentId: z.string(),
  message: z.string().optional(),
});

// Output
interface InterruptAgentOutput {
  success: boolean;
  agent: Agent;
  interruptedAt: Date;
}
```

**Příklad:**

```typescript
await trpc.agents.interrupt.mutate({
  agentId: 'agent-abc123',
  message: 'User requested pause',
});
```

### agents.sendInput

Pošle vstup do interaktivního agenta (pro HITL).

```typescript
// Input
const AgentInputMessage = z.object({
  agentId: z.string(),
  type: z.enum(['text', 'approval', 'choice', 'file']),
  content: z.union([
    z.string(),
    z.object({ approved: z.boolean(), feedback: z.string().optional() }),
    z.object({ choice: z.string() }),
    z.object({ path: z.string(), content: z.string() }),
  ]),
});

// Output
interface SendInputOutput {
  success: boolean;
  acknowledged: boolean;
}
```

**Příklad:**

```typescript
// Schválení checkpointu
await trpc.agents.sendInput.mutate({
  agentId: 'agent-abc123',
  type: 'approval',
  content: {
    approved: true,
    feedback: 'Looks good, proceed',
  },
});

// Výběr z možností
await trpc.agents.sendInput.mutate({
  agentId: 'agent-abc123',
  type: 'choice',
  content: {
    choice: 'option-2',
  },
});
```

## Subscriptions

### agents.onOutput

Real-time stream výstupu z agenta.

```typescript
// Input
z.object({
  agentId: z.string(),
  includeToolCalls: z.boolean().default(true),
});

// Output (stream)
interface AgentOutputEvent {
  agentId: string;
  timestamp: Date;
  type: 'stdout' | 'stderr' | 'tool_call' | 'tool_result' | 'thinking';
  content: string;
  metadata?: {
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    duration?: number;
  };
}
```

**Příklad:**

```typescript
const subscription = trpc.agents.onOutput.subscribe(
  { agentId: 'agent-abc123' },
  {
    onData: (event) => {
      switch (event.type) {
        case 'stdout':
          process.stdout.write(event.content);
          break;
        case 'tool_call':
          console.log(`\n[Tool: ${event.metadata?.toolName}]`);
          break;
        case 'tool_result':
          console.log(`[Result: ${event.content.slice(0, 100)}...]`);
          break;
      }
    },
    onError: (err) => {
      console.error('Stream error:', err);
    },
  }
);
```

### agents.onStateChange

Real-time notifikace o změnách stavu agenta.

```typescript
// Input
z.object({
  agentId: z.string(),
});

// Output (stream)
interface AgentStateChangeEvent {
  agentId: string;
  timestamp: Date;
  previousState: AgentState;
  newState: AgentState;
  reason?: string;
}

type AgentState =
  | 'initializing'
  | 'idle'
  | 'executing'
  | 'waiting_input'
  | 'terminating'
  | 'terminated'
  | 'error';
```

**Příklad:**

```typescript
trpc.agents.onStateChange.subscribe(
  { agentId: 'agent-abc123' },
  {
    onData: (event) => {
      console.log(`Agent state: ${event.previousState} -> ${event.newState}`);

      if (event.newState === 'waiting_input') {
        console.log('Agent is waiting for user input');
      }
    },
  }
);
```

## Error Codes

| Kód | Popis |
|-----|-------|
| `AGENT_NOT_FOUND` | Agent s daným ID neexistuje |
| `AGENT_BUSY` | Agent již provádí úkol |
| `AGENT_TERMINATED` | Agent byl již ukončen |
| `WORKER_UNAVAILABLE` | Žádný worker není k dispozici |
| `PROVIDER_UNAVAILABLE` | Provider není dostupný |
| `SPAWN_FAILED` | Nepodařilo se spustit agenta |
| `INTERRUPT_FAILED` | Nepodařilo se přerušit agenta |
| `INPUT_REJECTED` | Agent nepřijal vstup |

## Usage Examples

### Kompletní životní cyklus agenta

```typescript
// 1. Spawn agent
const { agent } = await trpc.agents.spawn.mutate({
  providerId: 'claude-code',
});

// 2. Subscribe to output
const outputSub = trpc.agents.onOutput.subscribe(
  { agentId: agent.id },
  {
    onData: (event) => {
      process.stdout.write(event.content);
    },
  }
);

// 3. Subscribe to state changes
const stateSub = trpc.agents.onStateChange.subscribe(
  { agentId: agent.id },
  {
    onData: async (event) => {
      if (event.newState === 'waiting_input') {
        // Handle HITL checkpoint
        const decision = await promptUser();
        await trpc.agents.sendInput.mutate({
          agentId: agent.id,
          type: 'approval',
          content: decision,
        });
      }
    },
  }
);

// 4. Wait for completion or timeout
await waitForState(agent.id, 'idle', { timeout: 3600000 });

// 5. Cleanup
outputSub.unsubscribe();
stateSub.unsubscribe();

await trpc.agents.terminate.mutate({
  agentId: agent.id,
});
```

### Batch operace

```typescript
// List all busy agents
const { agents } = await trpc.agents.list.query({
  status: 'busy',
});

// Interrupt all
await Promise.all(
  agents.map(a =>
    trpc.agents.interrupt.mutate({ agentId: a.id })
  )
);
```

---

## Souvislosti

- [tRPC: Tasks](./tasks.md)
- [tRPC: Providers](./providers.md)
- [WebSocket: Agent Events](../02-websocket-events/agent-events.md)
- [Agent Adapter Interface](../03-agent-adapter-interface/base-adapter.md)

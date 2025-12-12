# tRPC API Specification

## Přehled

ADO používá tRPC jako primární komunikační protokol mezi CLI/Dashboard a API Gateway. tRPC poskytuje end-to-end type safety bez nutnosti generování kódu.

## Proč tRPC

| Aspekt | tRPC | REST | gRPC |
|--------|------|------|------|
| Type safety | Full (TS native) | Manual/Generated | Generated |
| Subscriptions | Native (WS) | Polling/SSE | Streaming |
| Setup complexity | Low | Low | High |
| Client generation | Automatic | Manual | Required |
| Browser support | Full | Full | Limited |

## Router Structure

```typescript
import { router, publicProcedure, protectedProcedure } from './trpc';
import { z } from 'zod';

export const appRouter = router({
  // ============================================
  // TASKS
  // ============================================
  tasks: router({
    // Create new task
    create: protectedProcedure
      .input(z.object({
        prompt: z.string().min(1),
        projectId: z.string(),
        repositoryPath: z.string(),
        taskType: z.enum(['greenfield', 'feature', 'bugfix', 'refactor']),
        hitlPolicy: z.enum(['autonomous', 'spec-review', 'review-major', 'review-all']).optional(),
        providers: z.array(z.string()).optional(),
        excludeProviders: z.array(z.string()).optional(),
        maxCost: z.number().optional(),
        qualityGates: z.object({
          build: z.boolean().default(true),
          tests: z.boolean().default(true),
          lint: z.boolean().default(true),
          coverage: z.number().min(0).max(100).optional(),
        }).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return ctx.orchestrator.createTask(input);
      }),

    // Get task by ID
    get: publicProcedure
      .input(z.string())
      .query(async ({ input, ctx }) => {
        return ctx.orchestrator.getTask(input);
      }),

    // List tasks
    list: publicProcedure
      .input(z.object({
        status: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
        projectId: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }))
      .query(async ({ input, ctx }) => {
        return ctx.orchestrator.listTasks(input);
      }),

    // Cancel task
    cancel: protectedProcedure
      .input(z.string())
      .mutation(async ({ input, ctx }) => {
        return ctx.orchestrator.cancelTask(input);
      }),

    // Pause task
    pause: protectedProcedure
      .input(z.string())
      .mutation(async ({ input, ctx }) => {
        return ctx.orchestrator.pauseTask(input);
      }),

    // Resume task
    resume: protectedProcedure
      .input(z.object({
        taskId: z.string(),
        feedback: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return ctx.orchestrator.resumeTask(input.taskId, input.feedback);
      }),
  }),

  // ============================================
  // CHECKPOINTS
  // ============================================
  checkpoints: router({
    // List pending checkpoints
    listPending: publicProcedure
      .input(z.object({
        taskId: z.string().optional(),
        type: z.string().optional(),
      }))
      .query(async ({ input, ctx }) => {
        return ctx.orchestrator.listPendingCheckpoints(input);
      }),

    // Get checkpoint details
    get: publicProcedure
      .input(z.string())
      .query(async ({ input, ctx }) => {
        return ctx.orchestrator.getCheckpoint(input);
      }),

    // Resolve checkpoint
    resolve: protectedProcedure
      .input(z.object({
        checkpointId: z.string(),
        decision: z.enum(['approve', 'reject', 'modify', 'defer']),
        feedback: z.string().optional(),
        modifications: z.record(z.unknown()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return ctx.orchestrator.resolveCheckpoint(input);
      }),
  }),

  // ============================================
  // PROVIDERS
  // ============================================
  providers: router({
    // List all providers
    list: publicProcedure
      .query(async ({ ctx }) => {
        return ctx.providerRegistry.getAll();
      }),

    // Get provider status
    getStatus: publicProcedure
      .input(z.string())
      .query(async ({ input, ctx }) => {
        return ctx.providerRegistry.getStatus(input);
      }),

    // Enable/disable provider
    setEnabled: protectedProcedure
      .input(z.object({
        providerId: z.string(),
        enabled: z.boolean(),
      }))
      .mutation(async ({ input, ctx }) => {
        return ctx.providerRegistry.setEnabled(input.providerId, input.enabled);
      }),

    // Update provider config
    updateConfig: protectedProcedure
      .input(z.object({
        providerId: z.string(),
        config: z.record(z.unknown()),
      }))
      .mutation(async ({ input, ctx }) => {
        return ctx.providerRegistry.updateConfig(input.providerId, input.config);
      }),
  }),

  // ============================================
  // WORKERS
  // ============================================
  workers: router({
    // List workers
    list: publicProcedure
      .query(async ({ ctx }) => {
        return ctx.workerManager.listWorkers();
      }),

    // Scale workers
    scale: protectedProcedure
      .input(z.object({
        count: z.number().min(0).max(100),
      }))
      .mutation(async ({ input, ctx }) => {
        return ctx.workerManager.scale(input.count);
      }),

    // Get worker metrics
    metrics: publicProcedure
      .query(async ({ ctx }) => {
        return ctx.workerManager.getMetrics();
      }),
  }),

  // ============================================
  // SUBSCRIPTIONS (Real-time)
  // ============================================
  stream: router({
    // Subscribe to task progress
    taskProgress: publicProcedure
      .input(z.string())
      .subscription(async function* ({ input, ctx }) {
        const task = await ctx.orchestrator.getTask(input);
        if (!task) throw new Error('Task not found');

        for await (const event of ctx.orchestrator.subscribeToTask(input)) {
          yield event;
        }
      }),

    // Subscribe to task output (stdout/stderr)
    taskOutput: publicProcedure
      .input(z.string())
      .subscription(async function* ({ input, ctx }) {
        for await (const chunk of ctx.orchestrator.subscribeToOutput(input)) {
          yield chunk;
        }
      }),

    // Subscribe to system events
    systemEvents: protectedProcedure
      .subscription(async function* ({ ctx }) {
        for await (const event of ctx.eventBus.subscribe()) {
          yield event;
        }
      }),

    // Subscribe to checkpoint notifications
    checkpointNotifications: protectedProcedure
      .subscription(async function* ({ ctx }) {
        for await (const checkpoint of ctx.hitlController.subscribeToCheckpoints()) {
          yield checkpoint;
        }
      }),
  }),

  // ============================================
  // ANALYTICS
  // ============================================
  analytics: router({
    // Get usage statistics
    usage: publicProcedure
      .input(z.object({
        period: z.enum(['day', 'week', 'month']),
        projectId: z.string().optional(),
      }))
      .query(async ({ input, ctx }) => {
        return ctx.analytics.getUsage(input);
      }),

    // Get cost report
    costs: publicProcedure
      .input(z.object({
        period: z.enum(['day', 'week', 'month']),
      }))
      .query(async ({ input, ctx }) => {
        return ctx.analytics.getCosts(input);
      }),

    // Get quality metrics
    quality: publicProcedure
      .input(z.object({
        period: z.enum(['day', 'week', 'month']),
      }))
      .query(async ({ input, ctx }) => {
        return ctx.analytics.getQualityMetrics(input);
      }),
  }),
});

export type AppRouter = typeof appRouter;
```

## Client Usage

### CLI Client

```typescript
import { createTRPCProxyClient, httpBatchLink, wsLink } from '@trpc/client';
import type { AppRouter } from './server/router';

// HTTP client for queries/mutations
const httpClient = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${API_URL}/trpc`,
      headers: () => ({
        Authorization: `Bearer ${getToken()}`,
      }),
    }),
  ],
});

// WebSocket client for subscriptions
const wsClient = createTRPCProxyClient<AppRouter>({
  links: [
    wsLink({
      client: createWSClient({
        url: `${WS_URL}/trpc`,
      }),
    }),
  ],
});

// Usage
async function runTask(prompt: string) {
  // Create task
  const task = await httpClient.tasks.create.mutate({
    prompt,
    projectId: 'my-project',
    repositoryPath: '/path/to/repo',
    taskType: 'feature',
  });

  // Subscribe to progress
  const subscription = wsClient.stream.taskProgress.subscribe(task.id, {
    onData: (event) => {
      console.log(`Progress: ${event.progress}%`);
    },
    onError: (error) => {
      console.error('Subscription error:', error);
    },
  });

  return { task, subscription };
}
```

### React/Dashboard Client

```typescript
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from './server/router';

export const trpc = createTRPCReact<AppRouter>();

// In component
function TaskList() {
  const { data: tasks, isLoading } = trpc.tasks.list.useQuery({
    status: 'running',
    limit: 10,
  });

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      // Invalidate and refetch
      utils.tasks.list.invalidate();
    },
  });

  // Subscription
  trpc.stream.taskProgress.useSubscription(taskId, {
    onData: (event) => {
      // Update UI
    },
  });

  return (/* ... */);
}
```

## Error Handling

```typescript
import { TRPCError } from '@trpc/server';

// Server-side
throw new TRPCError({
  code: 'NOT_FOUND',
  message: 'Task not found',
  cause: originalError,
});

// Error codes
type TRPCErrorCode =
  | 'PARSE_ERROR'
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'METHOD_NOT_SUPPORTED'
  | 'TIMEOUT'
  | 'CONFLICT'
  | 'PRECONDITION_FAILED'
  | 'PAYLOAD_TOO_LARGE'
  | 'TOO_MANY_REQUESTS'
  | 'CLIENT_CLOSED_REQUEST'
  | 'INTERNAL_SERVER_ERROR';

// Client-side
try {
  await client.tasks.create.mutate(input);
} catch (error) {
  if (error instanceof TRPCClientError) {
    if (error.data?.code === 'TOO_MANY_REQUESTS') {
      // Handle rate limit
    }
  }
}
```

## Authentication

```typescript
import { initTRPC, TRPCError } from '@trpc/server';

const t = initTRPC.context<Context>().create();

// Middleware for protected routes
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Not authenticated',
    });
  }
  return next({
    ctx: {
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(isAuthed);
```

---

## Souvislosti

- [WebSocket Streaming](./websocket-streaming.md)
- [API: tRPC Procedures](../../05-api/01-trpc-procedures/)
- [FR-002: Distributed Orchestration](../../02-requirements/01-functional/FR-002-distributed-orchestration.md)

# tRPC Procedures: Checkpoints

## Přehled

API procedury pro správu checkpointů a HITL (Human-in-the-Loop) rozhodnutí.

## Router Definition

```typescript
import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';

export const checkpointsRouter = router({
  // Queries
  get: publicProcedure
    .input(z.string().uuid())
    .query(async ({ input: checkpointId, ctx }) => {
      return ctx.checkpointService.get(checkpointId);
    }),

  list: publicProcedure
    .input(ListCheckpointsInput)
    .query(async ({ input, ctx }) => {
      return ctx.checkpointService.list(input);
    }),

  getHITLPending: protectedProcedure
    .input(z.object({
      taskId: z.string().uuid().optional(),
    }))
    .query(async ({ input, ctx }) => {
      return ctx.checkpointService.getPendingHITL(ctx.user.id, input.taskId);
    }),

  // Mutations
  create: protectedProcedure
    .input(CreateCheckpointInput)
    .mutation(async ({ input, ctx }) => {
      return ctx.checkpointService.create(input);
    }),

  decide: protectedProcedure
    .input(HITLDecisionInput)
    .mutation(async ({ input, ctx }) => {
      return ctx.checkpointService.decide(input, ctx.user.id);
    }),

  restore: protectedProcedure
    .input(z.object({
      checkpointId: z.string().uuid(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return ctx.checkpointService.restore(input.checkpointId, ctx.user.id, input.reason);
    }),

  delete: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ input: checkpointId, ctx }) => {
      return ctx.checkpointService.delete(checkpointId, ctx.user.id);
    }),
});
```

## Input Schemas

### ListCheckpointsInput

```typescript
const ListCheckpointsInput = z.object({
  // Filtrování
  taskId: z.string().uuid().optional(),
  type: z.enum(['auto', 'phase', 'hitl', 'error', 'manual']).optional(),
  hitlRequired: z.boolean().optional(),
  hitlDecided: z.boolean().optional(),

  // Časový rozsah
  createdAfter: z.date().optional(),
  createdBefore: z.date().optional(),

  // Paginace
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),

  // Řazení
  orderBy: z.enum(['createdAt', 'type']).default('createdAt'),
  orderDir: z.enum(['asc', 'desc']).default('desc'),
});

type ListCheckpointsInput = z.infer<typeof ListCheckpointsInput>;
```

### CreateCheckpointInput

```typescript
const CreateCheckpointInput = z.object({
  taskId: z.string().uuid(),

  type: z.enum(['auto', 'phase', 'hitl', 'error', 'manual']),
  trigger: z.enum([
    'periodic',
    'phase_change',
    'subtask_complete',
    'validation_fail',
    'cost_threshold',
    'user_request',
  ]),

  description: z.string().max(500),

  // Workspace reference (git commit hash)
  workspaceRef: z.string(),

  // Optional agent state
  agentState: z.unknown().optional(),

  // HITL configuration
  hitl: z.object({
    required: z.boolean(),

    // Pokud required = true
    title: z.string().max(200).optional(),
    message: z.string().max(2000).optional(),

    options: z.array(z.object({
      id: z.string(),
      label: z.string().max(50),
      description: z.string().max(200),
      action: z.enum(['approve', 'reject', 'modify', 'retry', 'skip', 'escalate']),
      isDefault: z.boolean().default(false),
    })).max(6).optional(),

    context: z.record(z.unknown()).optional(),

    timeout: z.object({
      duration: z.number().int().min(60).max(86400), // 1 min - 24 hours
      defaultAction: z.enum(['approve', 'reject', 'pause']),
    }).optional(),
  }).optional(),

  metadata: z.record(z.unknown()).optional(),
});

type CreateCheckpointInput = z.infer<typeof CreateCheckpointInput>;
```

### HITLDecisionInput

```typescript
const HITLDecisionInput = z.object({
  checkpointId: z.string().uuid(),

  // Rozhodnutí
  action: z.enum(['approve', 'reject', 'modify', 'retry', 'skip', 'escalate']),
  selectedOption: z.string(),

  // Volitelný feedback
  feedback: z.string().max(2000).optional(),

  // Modifikace (pokud action = 'modify')
  modifications: z.record(z.unknown()).optional(),
});

type HITLDecisionInput = z.infer<typeof HITLDecisionInput>;
```

## Response Types

### Checkpoint

```typescript
interface Checkpoint {
  id: string;
  taskId: string;

  type: CheckpointType;
  trigger: CheckpointTrigger;

  description: string;
  workspaceRef: string;
  agentState?: unknown;

  hitlRequired: boolean;
  hitlConfig?: HITLConfig;
  hitlDecision?: HITLDecision;

  metadata: Record<string, unknown>;

  createdAt: Date;
  expiresAt?: Date;
}

interface HITLConfig {
  title: string;
  message: string;
  options: HITLOption[];
  context?: Record<string, unknown>;
  timeout?: {
    duration: number;
    defaultAction: HITLAction;
    expiresAt: Date;
  };
}

interface HITLOption {
  id: string;
  label: string;
  description: string;
  action: HITLAction;
  isDefault: boolean;
}

interface HITLDecision {
  id: string;
  userId: string;
  action: HITLAction;
  selectedOption: string;
  feedback?: string;
  modifications?: Record<string, unknown>;
  decidedAt: Date;
  responseTime: number;
  autoTriggered: boolean;
}
```

### PendingHITL

```typescript
interface PendingHITL {
  checkpoint: Checkpoint;
  task: {
    id: string;
    prompt: string;
    status: TaskStatus;
    phase: TaskPhase;
  };
  timeRemaining?: number; // seconds until auto-action
}
```

## Procedure Details

### checkpoints.get

Získání detailu checkpointu.

```typescript
// Request
const checkpoint = await trpc.checkpoints.get.query('checkpoint-uuid');

// Response
{
  id: 'cp-123',
  taskId: 'task-456',
  type: 'hitl',
  trigger: 'phase_change',
  description: 'Specification review required',
  workspaceRef: 'abc123def',
  hitlRequired: true,
  hitlConfig: {
    title: 'Review Specification',
    message: 'Please review the generated specification before proceeding.',
    options: [
      { id: 'approve', label: 'Approve', action: 'approve', isDefault: true },
      { id: 'modify', label: 'Request Changes', action: 'modify', isDefault: false },
      { id: 'reject', label: 'Reject', action: 'reject', isDefault: false },
    ],
    context: {
      specPath: 'docs/specs/SPEC-001.md',
      estimatedCost: 5.50,
    },
    timeout: {
      duration: 3600,
      defaultAction: 'approve',
      expiresAt: '2025-01-15T12:00:00Z',
    },
  },
  hitlDecision: null,
  createdAt: '2025-01-15T11:00:00Z',
}
```

### checkpoints.list

Seznam checkpointů s filtrováním.

```typescript
// Request
const result = await trpc.checkpoints.list.query({
  taskId: 'task-456',
  hitlRequired: true,
  hitlDecided: false,
  limit: 10,
});

// Response
{
  items: [Checkpoint, ...],
  nextCursor: 'cursor-xyz',
  hasMore: true,
  totalCount: 25,
}
```

### checkpoints.getHITLPending

Získání čekajících HITL rozhodnutí pro uživatele.

```typescript
// Request
const pending = await trpc.checkpoints.getHITLPending.query({});

// Response
[
  {
    checkpoint: Checkpoint,
    task: {
      id: 'task-456',
      prompt: 'Create REST API for todo management',
      status: 'paused',
      phase: 'specification',
    },
    timeRemaining: 1800, // 30 minutes
  },
  // ...
]
```

### checkpoints.create

Vytvoření nového checkpointu (typicky voláno orchestrátorem).

```typescript
// Request
const checkpoint = await trpc.checkpoints.create.mutate({
  taskId: 'task-456',
  type: 'hitl',
  trigger: 'phase_change',
  description: 'Architecture decision required',
  workspaceRef: 'git-commit-hash',
  hitl: {
    required: true,
    title: 'Architecture Decision',
    message: 'Choose the database architecture for the project.',
    options: [
      {
        id: 'postgresql',
        label: 'PostgreSQL',
        description: 'Relational database, good for complex queries',
        action: 'approve',
        isDefault: true,
      },
      {
        id: 'mongodb',
        label: 'MongoDB',
        description: 'Document database, good for flexible schemas',
        action: 'approve',
        isDefault: false,
      },
    ],
    timeout: {
      duration: 3600,
      defaultAction: 'approve',
    },
  },
});

// Response
{
  id: 'cp-789',
  taskId: 'task-456',
  type: 'hitl',
  // ...
}
```

### checkpoints.decide

Rozhodnutí v HITL checkpointu.

```typescript
// Request
const decision = await trpc.checkpoints.decide.mutate({
  checkpointId: 'cp-789',
  action: 'approve',
  selectedOption: 'postgresql',
  feedback: 'PostgreSQL is better for our use case due to complex reporting needs.',
});

// Response
{
  checkpoint: Checkpoint, // Updated with decision
  task: Task,             // Task is resumed
  decision: HITLDecision,
}
```

### checkpoints.restore

Obnovení stavu úkolu z checkpointu.

```typescript
// Request
const result = await trpc.checkpoints.restore.mutate({
  checkpointId: 'cp-456',
  reason: 'Implementation went in wrong direction',
});

// Response
{
  task: Task,             // Task restored to checkpoint state
  checkpoint: Checkpoint,
  restoredFiles: ['src/api/routes.ts', 'src/models/user.ts'],
}
```

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `CHECKPOINT_NOT_FOUND` | 404 | Checkpoint neexistuje |
| `CHECKPOINT_EXPIRED` | 410 | Checkpoint expiroval |
| `HITL_NOT_REQUIRED` | 400 | Checkpoint nevyžaduje HITL |
| `HITL_ALREADY_DECIDED` | 409 | HITL již bylo rozhodnuto |
| `INVALID_OPTION` | 400 | Neplatná vybraná možnost |
| `RESTORE_FAILED` | 500 | Obnovení z checkpointu selhalo |
| `UNAUTHORIZED` | 403 | Nemáte oprávnění |

```typescript
// Error handling
try {
  await trpc.checkpoints.decide.mutate({
    checkpointId: 'cp-789',
    action: 'approve',
    selectedOption: 'invalid-option',
  });
} catch (error) {
  if (error.code === 'INVALID_OPTION') {
    console.error('Selected option is not valid for this checkpoint');
  }
}
```

## WebSocket Integration

Pro real-time notifikace o HITL požadavcích.

```typescript
// Subscribe to HITL events
trpc.stream.hitlRequired.subscribe(undefined, {
  onData: (event) => {
    // Show notification to user
    showNotification({
      title: event.title,
      message: event.message,
      action: () => navigateTo(`/checkpoints/${event.checkpointId}`),
    });
  },
});
```

## Usage Examples

### CLI HITL Flow

```typescript
async function handleHITLCheckpoint(checkpoint: PendingHITL): Promise<void> {
  const { hitlConfig } = checkpoint.checkpoint;

  // Display checkpoint info
  console.log(`\n${hitlConfig.title}`);
  console.log(hitlConfig.message);
  console.log('');

  // Display context if available
  if (hitlConfig.context?.specPath) {
    console.log(`Spec: ${hitlConfig.context.specPath}`);
  }

  // Display options
  for (const option of hitlConfig.options) {
    const marker = option.isDefault ? '(default)' : '';
    console.log(`  [${option.id}] ${option.label} ${marker}`);
    console.log(`      ${option.description}`);
  }

  // Get user input
  const selected = await prompt('Select option:', {
    default: hitlConfig.options.find(o => o.isDefault)?.id,
  });

  // Optional feedback
  const feedback = await prompt('Feedback (optional):');

  // Submit decision
  await trpc.checkpoints.decide.mutate({
    checkpointId: checkpoint.checkpoint.id,
    action: hitlConfig.options.find(o => o.id === selected)!.action,
    selectedOption: selected,
    feedback: feedback || undefined,
  });

  console.log('Decision submitted, task resumed.');
}
```

### Dashboard HITL Component

```typescript
function HITLCheckpointCard({ checkpoint }: { checkpoint: PendingHITL }) {
  const decideMutation = trpc.checkpoints.decide.useMutation();

  const handleDecide = async (optionId: string) => {
    await decideMutation.mutateAsync({
      checkpointId: checkpoint.checkpoint.id,
      action: checkpoint.checkpoint.hitlConfig!.options.find(
        o => o.id === optionId
      )!.action,
      selectedOption: optionId,
    });
  };

  return (
    <Card>
      <CardHeader>
        <Title>{checkpoint.checkpoint.hitlConfig!.title}</Title>
        <Badge>Task: {checkpoint.task.prompt.slice(0, 50)}...</Badge>
      </CardHeader>

      <CardBody>
        <Text>{checkpoint.checkpoint.hitlConfig!.message}</Text>

        {checkpoint.timeRemaining && (
          <Alert>
            Auto-action in {formatDuration(checkpoint.timeRemaining)}
          </Alert>
        )}

        <OptionList>
          {checkpoint.checkpoint.hitlConfig!.options.map(option => (
            <OptionButton
              key={option.id}
              onClick={() => handleDecide(option.id)}
              isDefault={option.isDefault}
            >
              {option.label}
            </OptionButton>
          ))}
        </OptionList>
      </CardBody>
    </Card>
  );
}
```

---

## Souvislosti

- [tRPC Procedures: Tasks](./tasks.md)
- [WebSocket Events: Task Events](../02-websocket-events/task-events.md)
- [FR-006: HITL Checkpoints](../../02-requirements/01-functional/FR-006-hitl-checkpoints.md)
- [Data Models: Entities](../../03-architecture/04-data-models/entities.md)

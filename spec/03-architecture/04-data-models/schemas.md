# Data Models: Schemas

## Přehled

Zod schémata pro validaci dat v celém systému ADO. Schémata zajišťují type-safety na hranicích systému (API, konfigurace, databáze).

## Schema Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Schema Registry                           │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Config    │  │     API     │  │   Events    │             │
│  │   Schemas   │  │   Schemas   │  │   Schemas   │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Database   │  │  Validation │  │   Runtime   │             │
│  │   Schemas   │  │   Schemas   │  │   Schemas   │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

## Base Schemas

### Common Types

```typescript
import { z } from 'zod';

// UUID v7 (time-ordered)
export const UUIDSchema = z.string().uuid();

// ISO 8601 datetime
export const DateTimeSchema = z.coerce.date();

// Semver
export const SemverSchema = z.string().regex(
  /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/
);

// URL
export const URLSchema = z.string().url();

// Email
export const EmailSchema = z.string().email();

// File path
export const FilePathSchema = z.string().min(1).max(1000);

// Positive integer
export const PositiveIntSchema = z.number().int().positive();

// Percentage (0-100)
export const PercentageSchema = z.number().min(0).max(100);

// Cost in USD
export const CostSchema = z.number().min(0);

// Duration in seconds
export const DurationSchema = z.number().min(0);
```

### Pagination

```typescript
export const PaginationInputSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  direction: z.enum(['forward', 'backward']).default('forward'),
});

export const PaginatedResultSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
    prevCursor: z.string().nullable(),
    totalCount: z.number().int().optional(),
    hasMore: z.boolean(),
  });

export type PaginationInput = z.infer<typeof PaginationInputSchema>;
```

## Configuration Schemas

### Main Config

```typescript
export const ADOConfigSchema = z.object({
  version: z.literal('2.0'),

  project: z.object({
    id: z.string().min(1).max(100),
    name: z.string().optional(),
    repository: URLSchema.optional(),
  }),

  providers: z.record(z.string(), ProviderConfigSchema),

  hitl: HITLConfigSchema,

  quality: QualityConfigSchema,

  paths: PathsConfigSchema.optional(),

  telemetry: TelemetryConfigSchema.optional(),
});

export type ADOConfig = z.infer<typeof ADOConfigSchema>;
```

### Provider Config

```typescript
export const AccessModeConfigSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('subscription'),
    priority: z.number().int().min(1).max(10),
    enabled: z.boolean().default(true),
    subscription: z.object({
      plan: z.string(),
      rateLimits: RateLimitsSchema.optional(),
    }),
  }),
  z.object({
    mode: z.literal('api'),
    priority: z.number().int().min(1).max(10),
    enabled: z.boolean().default(true),
    api: z.object({
      model: z.string(),
      maxTokens: PositiveIntSchema.optional(),
      apiKeyEnvVar: z.string().optional(),
    }),
  }),
  z.object({
    mode: z.literal('local'),
    priority: z.number().int().min(1).max(10),
    enabled: z.boolean().default(true),
    local: z.object({
      model: z.string(),
      endpoint: URLSchema.optional(),
    }),
  }),
]);

export const ProviderConfigSchema = z.object({
  enabled: z.boolean().default(true),
  contextFile: FilePathSchema.optional(),
  accessModes: z.array(AccessModeConfigSchema).min(1),
  capabilities: AgentCapabilitiesSchema.optional(),
});

export const RateLimitsSchema = z.object({
  requestsPerMinute: PositiveIntSchema.optional(),
  requestsPerHour: PositiveIntSchema.optional(),
  requestsPerDay: PositiveIntSchema.optional(),
  tokensPerDay: PositiveIntSchema.optional(),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
```

### HITL Config

```typescript
export const HITLPolicySchema = z.enum([
  'autonomous',      // Bez lidské kontroly
  'spec-review',     // Review specifikace
  'checkpoint',      // Review na checkpointech
  'always',          // Vždy vyžadovat schválení
]);

export const HITLConfigSchema = z.object({
  defaultPolicy: HITLPolicySchema.default('spec-review'),

  checkpoints: z.object({
    specification: z.boolean().default(true),
    architecture: z.boolean().default(true),
    implementation: z.boolean().default(false),
    validation: z.boolean().default(false),
  }).optional(),

  timeout: z.object({
    duration: DurationSchema.default(3600),  // 1 hodina
    action: z.enum(['approve', 'reject', 'pause']).default('pause'),
  }).optional(),

  notifications: z.object({
    email: z.boolean().default(true),
    slack: z.boolean().default(false),
    webhook: URLSchema.optional(),
  }).optional(),
});

export type HITLConfig = z.infer<typeof HITLConfigSchema>;
```

### Quality Config

```typescript
export const QualityConfigSchema = z.object({
  build: z.object({
    required: z.boolean().default(true),
    command: z.string().default('pnpm build'),
    timeout: DurationSchema.default(300),
  }),

  test: z.object({
    required: z.boolean().default(true),
    command: z.string().default('pnpm test'),
    timeout: DurationSchema.default(600),
    minCoverage: PercentageSchema.default(80),
  }),

  lint: z.object({
    required: z.boolean().default(true),
    command: z.string().default('pnpm lint'),
    maxErrors: z.number().int().min(0).default(0),
    maxWarnings: z.number().int().min(0).default(10),
  }),

  typecheck: z.object({
    required: z.boolean().default(true),
    command: z.string().default('pnpm typecheck'),
  }),
});

export type QualityConfig = z.infer<typeof QualityConfigSchema>;
```

## API Schemas

### Task Schemas

```typescript
export const TaskTypeSchema = z.enum([
  'greenfield',
  'feature',
  'bugfix',
  'refactor',
  'test',
  'documentation',
  'review',
  'custom',
]);

export const TaskStatusSchema = z.enum([
  'pending',
  'queued',
  'running',
  'paused',
  'validating',
  'completed',
  'failed',
  'cancelled',
  'timeout',
]);

export const TaskPhaseSchema = z.enum([
  'specification',
  'planning',
  'implementation',
  'validation',
  'review',
  'finalization',
]);

export const CreateTaskInputSchema = z.object({
  prompt: z.string().min(10).max(50000),
  taskType: TaskTypeSchema.optional(),

  config: z.object({
    maxDuration: DurationSchema.default(3600),
    maxCost: CostSchema.default(10),
    maxRetries: z.number().int().min(0).max(5).default(3),

    qualityThresholds: z.object({
      minCoverage: PercentageSchema.default(80),
      maxLintErrors: z.number().int().min(0).default(0),
      requireBuild: z.boolean().default(true),
    }).optional(),

    hitlPolicy: HITLPolicySchema.optional(),
    providers: z.array(z.string()).optional(),
    allowApiFallback: z.boolean().default(true),
  }).optional(),

  tags: z.array(z.string().max(50)).max(10).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const TaskSchema = z.object({
  id: UUIDSchema,
  externalId: z.string().optional(),
  parentTaskId: UUIDSchema.optional(),
  rootTaskId: UUIDSchema.optional(),

  prompt: z.string(),
  normalizedPrompt: z.string().optional(),
  taskType: TaskTypeSchema,

  status: TaskStatusSchema,
  phase: TaskPhaseSchema,
  progress: PercentageSchema,

  userId: UUIDSchema,
  workerId: UUIDSchema.optional(),
  providerId: z.string().optional(),
  accessMode: z.enum(['subscription', 'api', 'local']).optional(),

  config: z.object({
    maxDuration: DurationSchema,
    maxCost: CostSchema,
    maxRetries: z.number().int(),
    qualityThresholds: z.object({
      minCoverage: PercentageSchema,
      maxLintErrors: z.number().int(),
      requireBuild: z.boolean(),
    }),
    hitlPolicy: HITLPolicySchema,
    providers: z.array(z.string()).optional(),
    allowApiFallback: z.boolean(),
  }),

  result: TaskResultSchema.optional(),
  error: TaskErrorSchema.optional(),

  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  startedAt: DateTimeSchema.optional(),
  completedAt: DateTimeSchema.optional(),

  metrics: TaskMetricsSchema,

  tags: z.array(z.string()),
  metadata: z.record(z.unknown()),
});

export const TaskResultSchema = z.object({
  success: z.boolean(),

  filesCreated: z.array(FilePathSchema),
  filesModified: z.array(FilePathSchema),
  filesDeleted: z.array(FilePathSchema),

  testsRun: z.number().int().min(0),
  testsPassed: z.number().int().min(0),
  coverage: PercentageSchema,
  lintErrors: z.number().int().min(0),

  commitHash: z.string().optional(),
  branch: z.string().optional(),
  pullRequestUrl: URLSchema.optional(),

  specPath: FilePathSchema,
  changelogEntry: z.string().optional(),
});

export const TaskErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  stack: z.string().optional(),
  recoverable: z.boolean(),
});

export const TaskMetricsSchema = z.object({
  tokensUsed: z.number().int().min(0),
  tokensInput: z.number().int().min(0),
  tokensOutput: z.number().int().min(0),
  cost: CostSchema,
  duration: DurationSchema,
  retryCount: z.number().int().min(0),
  checkpointCount: z.number().int().min(0),
  subtaskCount: z.number().int().min(0),
});

export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;
export type Task = z.infer<typeof TaskSchema>;
```

### Checkpoint Schemas

```typescript
export const CheckpointTypeSchema = z.enum([
  'auto',
  'phase',
  'hitl',
  'error',
  'manual',
]);

export const CheckpointTriggerSchema = z.enum([
  'periodic',
  'phase_change',
  'subtask_complete',
  'validation_fail',
  'cost_threshold',
  'user_request',
]);

export const CheckpointSchema = z.object({
  id: UUIDSchema,
  taskId: UUIDSchema,

  type: CheckpointTypeSchema,
  trigger: CheckpointTriggerSchema,

  taskState: z.record(z.unknown()),
  workspaceRef: z.string(),
  agentState: z.unknown().optional(),

  hitlRequired: z.boolean(),
  hitlDecision: HITLDecisionSchema.optional(),

  description: z.string(),
  metadata: z.record(z.unknown()),

  createdAt: DateTimeSchema,
  expiresAt: DateTimeSchema.optional(),
});

export const HITLActionSchema = z.enum([
  'approve',
  'reject',
  'modify',
  'retry',
  'skip',
  'escalate',
]);

export const HITLDecisionSchema = z.object({
  id: UUIDSchema,
  checkpointId: UUIDSchema,
  taskId: UUIDSchema,
  userId: UUIDSchema,

  action: HITLActionSchema,
  feedback: z.string().optional(),
  modifications: z.record(z.unknown()).optional(),

  presentedOptions: z.array(z.object({
    id: z.string(),
    label: z.string(),
    description: z.string(),
    action: HITLActionSchema,
    isDefault: z.boolean(),
  })),
  selectedOption: z.string(),

  requestedAt: DateTimeSchema,
  decidedAt: DateTimeSchema,
  responseTime: DurationSchema,

  autoActionTriggered: z.boolean(),
  autoActionReason: z.string().optional(),
});

export type Checkpoint = z.infer<typeof CheckpointSchema>;
export type HITLDecision = z.infer<typeof HITLDecisionSchema>;
```

### Worker Schemas

```typescript
export const WorkerTypeSchema = z.enum(['local', 'remote', 'cloud']);

export const WorkerStatusSchema = z.enum([
  'starting',
  'idle',
  'busy',
  'draining',
  'offline',
]);

export const WorkerLocationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('local') }),
  z.object({
    type: z.literal('kubernetes'),
    namespace: z.string(),
    pod: z.string(),
  }),
  z.object({
    type: z.literal('docker'),
    container: z.string(),
  }),
  z.object({
    type: z.literal('ec2'),
    instanceId: z.string(),
    region: z.string(),
  }),
]);

export const WorkerResourcesSchema = z.object({
  cpuCores: PositiveIntSchema,
  memoryMB: PositiveIntSchema,
  diskGB: PositiveIntSchema,
  gpuCount: z.number().int().min(0).optional(),
});

export const WorkerSchema = z.object({
  id: UUIDSchema,

  hostname: z.string(),
  instanceId: z.string().optional(),

  type: WorkerTypeSchema,
  location: WorkerLocationSchema,

  status: WorkerStatusSchema,
  currentTaskId: UUIDSchema.optional(),

  capabilities: z.array(z.string()),
  resources: WorkerResourcesSchema,

  metrics: z.object({
    tasksCompleted: z.number().int().min(0),
    tasksFailed: z.number().int().min(0),
    totalDuration: DurationSchema,
    uptime: DurationSchema,
    lastTaskDuration: DurationSchema.optional(),
  }),

  version: z.string(),
  metadata: z.record(z.unknown()),

  registeredAt: DateTimeSchema,
  lastHeartbeat: DateTimeSchema,
});

export type Worker = z.infer<typeof WorkerSchema>;
```

### Provider Schemas

```typescript
export const AgentCapabilitiesSchema = z.object({
  codeGeneration: z.boolean(),
  codeReview: z.boolean(),
  refactoring: z.boolean(),
  testing: z.boolean(),
  documentation: z.boolean(),
  debugging: z.boolean(),
  multiFile: z.boolean(),
  projectContext: z.boolean(),
  webSearch: z.boolean(),
  maxContextTokens: PositiveIntSchema,
});

export const ProviderStatusSchema = z.enum([
  'available',
  'rate_limited',
  'unavailable',
  'disabled',
]);

export const ProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),

  enabled: z.boolean(),
  status: ProviderStatusSchema,

  capabilities: AgentCapabilitiesSchema,
  accessModes: z.array(AccessModeConfigSchema),

  rateLimits: z.object({
    current: z.object({
      requests: z.number().int(),
      tokens: z.number().int(),
    }),
    limits: RateLimitsSchema,
    resetAt: DateTimeSchema.optional(),
  }),

  metrics: z.object({
    totalRequests: z.number().int(),
    successfulRequests: z.number().int(),
    failedRequests: z.number().int(),
    averageLatency: z.number(),
    totalTokens: z.number().int(),
    totalCost: CostSchema,
  }),

  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export type Provider = z.infer<typeof ProviderSchema>;
export type AgentCapabilities = z.infer<typeof AgentCapabilitiesSchema>;
```

## Validation Helpers

```typescript
// Validace s user-friendly chybami
export function validateConfig(config: unknown): ADOConfig {
  const result = ADOConfigSchema.safeParse(config);

  if (!result.success) {
    const errors = result.error.errors.map(e => ({
      path: e.path.join('.'),
      message: e.message,
    }));

    throw new ConfigValidationError(errors);
  }

  return result.data;
}

// Částečná validace
export function validatePartial<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): Partial<z.infer<T>> {
  const partialSchema = schema.partial();
  return partialSchema.parse(data);
}

// Validace s transformací
export function parseAndTransform<T>(
  schema: z.ZodType<T>,
  data: unknown
): T {
  return schema.parse(data);
}
```

---

## Souvislosti

- [Data Models: Entities](./entities.md)
- [Data Models: Events](./events.md)
- [tRPC Procedures](../../05-api/01-trpc-procedures/tasks.md)

# tRPC Procedures: Providers

## Přehled

API procedury pro správu AI providerů a jejich konfiguraci.

## Router Definition

```typescript
import { z } from 'zod';
import { router, publicProcedure, protectedProcedure, adminProcedure } from '../trpc';

export const providersRouter = router({
  // Queries
  list: publicProcedure
    .query(async ({ ctx }) => {
      return ctx.providerService.list();
    }),

  get: publicProcedure
    .input(z.string())
    .query(async ({ input: providerId, ctx }) => {
      return ctx.providerService.get(providerId);
    }),

  getStatus: publicProcedure
    .input(z.string())
    .query(async ({ input: providerId, ctx }) => {
      return ctx.providerService.getStatus(providerId);
    }),

  getCapabilities: publicProcedure
    .input(z.string())
    .query(async ({ input: providerId, ctx }) => {
      return ctx.providerService.getCapabilities(providerId);
    }),

  getRateLimits: protectedProcedure
    .input(z.string())
    .query(async ({ input: providerId, ctx }) => {
      return ctx.providerService.getRateLimits(providerId, ctx.user.id);
    }),

  // Mutations
  enable: protectedProcedure
    .input(z.string())
    .mutation(async ({ input: providerId, ctx }) => {
      return ctx.providerService.enable(providerId, ctx.user.id);
    }),

  disable: protectedProcedure
    .input(z.string())
    .mutation(async ({ input: providerId, ctx }) => {
      return ctx.providerService.disable(providerId, ctx.user.id);
    }),

  configure: protectedProcedure
    .input(ConfigureProviderInput)
    .mutation(async ({ input, ctx }) => {
      return ctx.providerService.configure(input, ctx.user.id);
    }),

  setAccessMode: protectedProcedure
    .input(SetAccessModeInput)
    .mutation(async ({ input, ctx }) => {
      return ctx.providerService.setAccessMode(input, ctx.user.id);
    }),

  setPriority: protectedProcedure
    .input(SetPriorityInput)
    .mutation(async ({ input, ctx }) => {
      return ctx.providerService.setPriority(input, ctx.user.id);
    }),

  // Admin
  healthCheck: adminProcedure
    .query(async ({ ctx }) => {
      return ctx.providerService.healthCheckAll();
    }),

  resetRateLimits: adminProcedure
    .input(z.string())
    .mutation(async ({ input: providerId, ctx }) => {
      return ctx.providerService.resetRateLimits(providerId);
    }),
});
```

## Input Schemas

### ConfigureProviderInput

```typescript
const ConfigureProviderInput = z.object({
  providerId: z.string(),

  // Základní konfigurace
  enabled: z.boolean().optional(),
  contextFile: z.string().max(255).optional(),

  // Access modes
  accessModes: z.array(z.object({
    mode: z.enum(['subscription', 'api', 'local']),
    priority: z.number().int().min(1).max(10),
    enabled: z.boolean(),

    // Pro subscription mode
    subscription: z.object({
      plan: z.string(),
      rateLimits: z.object({
        requestsPerMinute: z.number().int().optional(),
        requestsPerHour: z.number().int().optional(),
        requestsPerDay: z.number().int().optional(),
        tokensPerDay: z.number().int().optional(),
      }).optional(),
    }).optional(),

    // Pro API mode
    api: z.object({
      model: z.string(),
      apiKeyEnvVar: z.string().optional(),
      maxTokens: z.number().int().optional(),
    }).optional(),

    // Pro local mode
    local: z.object({
      model: z.string(),
      endpoint: z.string().url().optional(),
    }).optional(),
  })).optional(),

  // Capabilities override
  capabilities: z.object({
    maxContextTokens: z.number().int().optional(),
    // ... další capabilities
  }).optional(),
});

type ConfigureProviderInput = z.infer<typeof ConfigureProviderInput>;
```

### SetAccessModeInput

```typescript
const SetAccessModeInput = z.object({
  providerId: z.string(),
  mode: z.enum(['subscription', 'api', 'local']),
  config: z.union([
    // Subscription
    z.object({
      plan: z.string(),
      rateLimits: z.object({
        requestsPerMinute: z.number().int().optional(),
        requestsPerHour: z.number().int().optional(),
        requestsPerDay: z.number().int().optional(),
        tokensPerDay: z.number().int().optional(),
      }).optional(),
    }),
    // API
    z.object({
      model: z.string(),
      apiKeyEnvVar: z.string(),
      maxTokens: z.number().int().optional(),
    }),
    // Local
    z.object({
      model: z.string(),
      endpoint: z.string().url(),
    }),
  ]),
});

type SetAccessModeInput = z.infer<typeof SetAccessModeInput>;
```

### SetPriorityInput

```typescript
const SetPriorityInput = z.object({
  providers: z.array(z.object({
    providerId: z.string(),
    priority: z.number().int().min(1).max(10),
  })),
});

type SetPriorityInput = z.infer<typeof SetPriorityInput>;
```

## Response Types

### Provider

```typescript
interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  version: string;

  enabled: boolean;
  status: ProviderStatus;

  capabilities: AgentCapabilities;
  accessModes: AccessMode[];
  activeAccessMode?: AccessModeType;

  rateLimits: RateLimitStatus;
  metrics: ProviderMetrics;

  contextFile?: string;
  metadata: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

type ProviderType =
  | 'claude-code'
  | 'gemini-cli'
  | 'cursor-cli'
  | 'copilot-cli'
  | 'codex-cli'
  | 'custom';

type ProviderStatus =
  | 'available'
  | 'rate_limited'
  | 'unavailable'
  | 'disabled';
```

### AgentCapabilities

```typescript
interface AgentCapabilities {
  codeGeneration: boolean;
  codeReview: boolean;
  refactoring: boolean;
  testing: boolean;
  documentation: boolean;
  debugging: boolean;
  multiFile: boolean;
  projectContext: boolean;
  webSearch: boolean;
  maxContextTokens: number;
}
```

### AccessMode

```typescript
interface AccessMode {
  id: string;
  type: AccessModeType;
  priority: number;
  enabled: boolean;

  // Subscription specific
  subscription?: {
    plan: string;
    rateLimits: RateLimits;
  };

  // API specific
  api?: {
    model: string;
    pricing: {
      inputPer1kTokens: number;
      outputPer1kTokens: number;
    };
    maxTokens: number;
  };

  // Local specific
  local?: {
    model: string;
    endpoint: string;
  };
}

type AccessModeType = 'subscription' | 'api' | 'local';
```

### RateLimitStatus

```typescript
interface RateLimitStatus {
  current: {
    requests: number;
    tokens: number;
    cost: number;
  };
  limits: RateLimits;
  resetAt?: Date;
  isLimited: boolean;
  estimatedWait?: number; // seconds
}

interface RateLimits {
  requestsPerMinute?: number;
  requestsPerHour?: number;
  requestsPerDay?: number;
  tokensPerDay?: number;
}
```

### ProviderMetrics

```typescript
interface ProviderMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  totalTokens: number;
  totalCost: number;

  // Per-period metrics
  today: {
    requests: number;
    tokens: number;
    cost: number;
  };
  thisMonth: {
    requests: number;
    tokens: number;
    cost: number;
  };
}
```

### HealthCheckResult

```typescript
interface HealthCheckResult {
  providers: Record<string, {
    status: 'healthy' | 'degraded' | 'unhealthy';
    latency?: number;
    lastCheck: Date;
    error?: string;
    details?: {
      binaryFound: boolean;
      binaryVersion?: string;
      authenticated: boolean;
      rateLimitRemaining?: number;
    };
  }>;
  summary: {
    healthy: number;
    degraded: number;
    unhealthy: number;
  };
}
```

## Procedure Details

### providers.list

Získání seznamu všech providerů.

```typescript
// Request
const providers = await trpc.providers.list.query();

// Response
[
  {
    id: 'claude-code',
    name: 'Claude Code',
    type: 'claude-code',
    version: '1.0.23',
    enabled: true,
    status: 'available',
    capabilities: {
      codeGeneration: true,
      codeReview: true,
      refactoring: true,
      testing: true,
      documentation: true,
      debugging: true,
      multiFile: true,
      projectContext: true,
      webSearch: true,
      maxContextTokens: 200000,
    },
    accessModes: [
      {
        id: 'sub-1',
        type: 'subscription',
        priority: 1,
        enabled: true,
        subscription: {
          plan: 'max',
          rateLimits: {
            requestsPerHour: 100,
            tokensPerDay: 5000000,
          },
        },
      },
      {
        id: 'api-1',
        type: 'api',
        priority: 2,
        enabled: true,
        api: {
          model: 'claude-sonnet-4-20250514',
          pricing: {
            inputPer1kTokens: 0.003,
            outputPer1kTokens: 0.015,
          },
          maxTokens: 200000,
        },
      },
    ],
    activeAccessMode: 'subscription',
    rateLimits: {
      current: { requests: 45, tokens: 1500000, cost: 0 },
      limits: { requestsPerHour: 100, tokensPerDay: 5000000 },
      isLimited: false,
    },
  },
  // ... další providers
]
```

### providers.get

Detailní informace o provideru.

```typescript
// Request
const provider = await trpc.providers.get.query('claude-code');

// Response
{
  id: 'claude-code',
  name: 'Claude Code',
  // ... full provider object
}
```

### providers.getStatus

Rychlý status provideru.

```typescript
// Request
const status = await trpc.providers.getStatus.query('claude-code');

// Response
{
  providerId: 'claude-code',
  status: 'available',
  activeAccessMode: 'subscription',
  rateLimits: {
    current: { requests: 45, tokens: 1500000 },
    limits: { requestsPerHour: 100, tokensPerDay: 5000000 },
    isLimited: false,
    resetAt: '2025-01-15T12:00:00Z',
  },
}
```

### providers.getRateLimits

Detailní rate limit informace.

```typescript
// Request
const limits = await trpc.providers.getRateLimits.query('claude-code');

// Response
{
  subscription: {
    plan: 'max',
    current: {
      requestsThisHour: 45,
      requestsToday: 320,
      tokensToday: 1500000,
    },
    limits: {
      requestsPerHour: 100,
      requestsPerDay: 1000,
      tokensPerDay: 5000000,
    },
    resetTimes: {
      hourly: '2025-01-15T12:00:00Z',
      daily: '2025-01-16T00:00:00Z',
    },
  },
  api: {
    model: 'claude-sonnet-4-20250514',
    pricing: {
      inputPer1kTokens: 0.003,
      outputPer1kTokens: 0.015,
    },
    budgetRemaining: 50.00,
  },
}
```

### providers.enable / providers.disable

Zapnutí/vypnutí provideru.

```typescript
// Enable
const provider = await trpc.providers.enable.mutate('gemini-cli');

// Disable
const provider = await trpc.providers.disable.mutate('codex-cli');

// Response
{
  id: 'gemini-cli',
  enabled: true, // or false
  status: 'available', // or 'disabled'
}
```

### providers.configure

Komplexní konfigurace provideru.

```typescript
// Request
const provider = await trpc.providers.configure.mutate({
  providerId: 'claude-code',
  enabled: true,
  contextFile: 'CLAUDE.md',
  accessModes: [
    {
      mode: 'subscription',
      priority: 1,
      enabled: true,
      subscription: {
        plan: 'max',
        rateLimits: {
          requestsPerHour: 100,
          tokensPerDay: 5000000,
        },
      },
    },
    {
      mode: 'api',
      priority: 2,
      enabled: true,
      api: {
        model: 'claude-sonnet-4-20250514',
        apiKeyEnvVar: 'ANTHROPIC_API_KEY',
        maxTokens: 200000,
      },
    },
  ],
});

// Response
// Updated Provider object
```

### providers.setAccessMode

Přidání nebo úprava access mode.

```typescript
// Request
await trpc.providers.setAccessMode.mutate({
  providerId: 'openai-codex',
  mode: 'api',
  config: {
    model: 'gpt-4o',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    maxTokens: 128000,
  },
});
```

### providers.setPriority

Nastavení priority providerů.

```typescript
// Request
await trpc.providers.setPriority.mutate({
  providers: [
    { providerId: 'claude-code', priority: 1 },
    { providerId: 'gemini-cli', priority: 2 },
    { providerId: 'cursor-cli', priority: 3 },
  ],
});
```

### providers.healthCheck

Health check všech providerů (admin only).

```typescript
// Request
const health = await trpc.providers.healthCheck.query();

// Response
{
  providers: {
    'claude-code': {
      status: 'healthy',
      latency: 45,
      lastCheck: '2025-01-15T10:30:00Z',
      details: {
        binaryFound: true,
        binaryVersion: '1.0.23',
        authenticated: true,
        rateLimitRemaining: 55,
      },
    },
    'gemini-cli': {
      status: 'degraded',
      latency: 1200,
      lastCheck: '2025-01-15T10:30:00Z',
      error: 'High latency detected',
    },
    'cursor-cli': {
      status: 'unhealthy',
      lastCheck: '2025-01-15T10:30:00Z',
      error: 'Binary not found in PATH',
      details: {
        binaryFound: false,
      },
    },
  },
  summary: {
    healthy: 1,
    degraded: 1,
    unhealthy: 1,
  },
}
```

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `PROVIDER_NOT_FOUND` | 404 | Provider neexistuje |
| `PROVIDER_DISABLED` | 400 | Provider je vypnutý |
| `PROVIDER_UNAVAILABLE` | 503 | Provider je nedostupný |
| `RATE_LIMITED` | 429 | Překročen rate limit |
| `INVALID_ACCESS_MODE` | 400 | Neplatný access mode |
| `CONFIGURATION_ERROR` | 400 | Chyba v konfiguraci |
| `UNAUTHORIZED` | 403 | Nemáte oprávnění |

## CLI Examples

```bash
# List providers
ado providers list
# ID           NAME         STATUS      MODE           PRIORITY
# claude-code  Claude Code  available   subscription   1
# gemini-cli   Gemini CLI   available   subscription   2
# cursor-cli   Cursor CLI   disabled    -              -

# Get status
ado providers status claude-code
# Provider: claude-code
# Status: available
# Mode: subscription (plan: max)
# Usage: 45/100 requests/hour, 1.5M/5M tokens/day

# Configure
ado config providers
# Interactive configuration wizard

# Enable/disable
ado providers enable gemini-cli
ado providers disable codex-cli

# Set priority
ado providers priority claude-code=1 gemini-cli=2 cursor-cli=3
```

---

## Souvislosti

- [tRPC Procedures: Tasks](./tasks.md)
- [Agent Adapters](../../03-architecture/03-component-diagrams/agent-adapters.md)
- [FR-001: Autonomous Execution](../../02-requirements/01-functional/FR-001-autonomous-execution.md)

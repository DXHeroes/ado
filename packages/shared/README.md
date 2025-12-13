# @dxheroes/ado-shared

Shared types, utilities, and interfaces for ADO (Agentic Development Orchestrator).

## Features

- **Type Definitions** - Comprehensive TypeScript types for all ADO components
- **Error Classes** - Structured error handling with remediation hints
- **Logger** - Simple structured logging with color support
- **Type Safety** - Full end-to-end type safety across packages

## Installation

```bash
pnpm add @dxheroes/ado-shared
```

## Types

### Provider Types

#### `ProviderConfig`

Configuration for a provider (agent).

```typescript
interface ProviderConfig {
  id: string;
  enabled: boolean;
  accessModes: AccessModeConfig[];
  capabilities: AgentCapabilities;
  contextFile?: string;
}
```

**Example:**
```typescript
const provider: ProviderConfig = {
  id: 'claude-code',
  enabled: true,
  accessModes: [
    {
      mode: 'subscription',
      priority: 1,
      enabled: true,
      subscription: {
        plan: 'max',
        rateLimits: {
          requestsPerDay: 500,
          requestsPerHour: 100,
        },
      },
    },
  ],
  capabilities: {
    codeGeneration: true,
    codeReview: true,
    testing: true,
    documentation: true,
    languages: ['typescript', 'python'],
    maxContextTokens: 200000,
    supportsStreaming: true,
  },
  contextFile: 'CLAUDE.md',
};
```

#### `AccessModeConfig`

Configuration for provider access modes (subscription or API).

```typescript
type AccessModeConfig = SubscriptionModeConfig | ApiModeConfig;

interface SubscriptionModeConfig {
  mode: 'subscription';
  priority: number;
  enabled: boolean;
  subscription: SubscriptionConfig;
}

interface ApiModeConfig {
  mode: 'api';
  priority: number;
  enabled: boolean;
  api: ApiConfig;
}
```

#### `AgentCapabilities`

Capabilities supported by an agent.

```typescript
interface AgentCapabilities {
  codeGeneration: boolean;
  codeReview: boolean;
  refactoring: boolean;
  testing: boolean;
  documentation: boolean;
  debugging: boolean;
  languages: string[];
  maxContextTokens: number;
  supportsStreaming: boolean;
  supportsMCP?: boolean;
  supportsResume?: boolean;
}
```

### Agent Types

#### `AgentAdapter`

Interface for agent adapters.

```typescript
interface AgentAdapter {
  readonly id: string;
  readonly capabilities: AgentCapabilities;

  initialize(config: AgentConfig): Promise<void>;
  isAvailable(): Promise<boolean>;
  execute(task: AgentTask): AsyncIterable<AgentEvent>;
  interrupt(): Promise<void>;
  getContextFile(): string;
  setProjectContext(context: ProjectContext): Promise<void>;
  getRateLimitDetector(): RateLimitDetector;
}
```

#### `AgentTask`

Task definition for agent execution.

```typescript
interface AgentTask {
  id: string;
  prompt: string;
  projectContext: ProjectContext;
  sessionId?: string;
  options?: AgentTaskOptions;
}
```

#### `AgentEvent`

Events emitted during agent execution.

```typescript
type AgentEvent =
  | AgentStartEvent
  | AgentOutputEvent
  | AgentToolUseEvent
  | AgentToolResultEvent
  | AgentErrorEvent
  | AgentRateLimitEvent
  | AgentCompleteEvent
  | AgentInterruptEvent;

interface AgentStartEvent {
  type: 'start';
  timestamp: Date;
  taskId: string;
  sessionId: string;
}

interface AgentOutputEvent {
  type: 'output';
  timestamp: Date;
  taskId: string;
  content: string;
  isPartial: boolean;
}

interface AgentCompleteEvent {
  type: 'complete';
  timestamp: Date;
  taskId: string;
  success: boolean;
  output?: string;
  tokensUsed?: {
    input: number;
    output: number;
  };
}
```

#### `ProjectContext`

Project context passed to agents.

```typescript
interface ProjectContext {
  projectId: string;
  repositoryPath: string;
  repositoryKey: string;
  contextFile?: string;
}
```

### Rate Limit Types

#### `RateLimitDetector`

Interface for rate limit detection.

```typescript
interface RateLimitDetector {
  getStatus(): Promise<RateLimitStatus>;
  parseRateLimitError(error: Error): RateLimitInfo | null;
  getRemainingCapacity(): Promise<RemainingCapacity>;
  recordUsage(usage: UsageRecord): Promise<void>;
}
```

#### `RateLimitStatus`

Current rate limit status.

```typescript
interface RateLimitStatus {
  isLimited: boolean;
  resetAt?: Date;
  reason?: string;
}
```

#### `RateLimitInfo`

Detailed rate limit information.

```typescript
interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: Date;
  scope?: 'daily' | 'hourly' | 'monthly';
}
```

#### `RemainingCapacity`

Remaining capacity across different scopes.

```typescript
interface RemainingCapacity {
  requestsPerDay?: number;
  requestsPerHour?: number;
  requestsPerMinute?: number;
  tokensPerDay?: number;
}
```

### Task Types

#### `TaskStatus`

Task execution status.

```typescript
type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'interrupted';
```

#### `TaskResult`

Result of task execution.

```typescript
interface TaskResult {
  taskId: string;
  status: TaskStatus;
  output?: string;
  error?: Error;
  metrics?: TaskMetrics;
}

interface TaskMetrics {
  duration: number;
  tokensUsed?: {
    input: number;
    output: number;
  };
  cost?: number;
}
```

### Configuration Types

#### `AdoConfig`

Main ADO configuration.

```typescript
interface AdoConfig {
  version: string;
  project?: ProjectConfig;
  providers: Record<string, ProviderConfig>;
  routing: RoutingConfig;
  checkpoints?: CheckpointConfig;
  quality?: QualityConfig;
  parallelization?: ParallelizationConfig;
  telemetry?: TelemetryConfig;
  notifications?: NotificationsConfig;
  state?: StateConfig;
  deployment?: DeploymentConfig;
}
```

#### `RoutingConfig`

Routing strategy configuration.

```typescript
interface RoutingConfig {
  strategy: 'subscription-first' | 'api-first' | 'cost-optimized';
  apiFallback?: {
    enabled: boolean;
    threshold?: number;
  };
}
```

#### `CheckpointConfig`

Checkpoint and HITL configuration.

```typescript
interface CheckpointConfig {
  enabled: boolean;
  autoSave: boolean;
  escalationThresholds?: {
    maxIterations?: number;
    maxDuration?: number;
  };
}
```

## Utilities

### Logger

Structured logging with color support.

#### Creating a Logger

```typescript
import { createLogger } from '@dxheroes/ado-shared';

const logger = createLogger({
  level: 'info',  // 'debug' | 'info' | 'warn' | 'error'
  format: 'pretty',  // 'pretty' | 'json'
  prefix: 'my-module',
});
```

#### Logging Methods

```typescript
// Debug logging
logger.debug('Starting task', { taskId: 'task-123' });

// Info logging
logger.info('Task completed', { duration: 5000 });

// Warning logging
logger.warn('Rate limit approaching', { remaining: 10 });

// Error logging
logger.error('Task failed', new Error('Network error'), {
  taskId: 'task-123',
  retries: 3,
});
```

#### Child Loggers

```typescript
const childLogger = logger.child('sub-module');
childLogger.info('Processing...');
// Output: [my-module:sub-module] Processing...
```

#### Log Formats

**Pretty Format** (default for TTY):
```
12:34:56.789 [INFO]  [my-module] Task completed { duration: 5000 }
```

**JSON Format** (default for non-TTY):
```json
{
  "level": "info",
  "timestamp": "2025-01-13T12:34:56.789Z",
  "message": "Task completed",
  "prefix": "my-module",
  "data": { "duration": 5000 }
}
```

### Error Classes

Structured error handling with remediation hints.

#### `AdoError`

Base error class for all ADO errors.

```typescript
import { AdoError } from '@dxheroes/ado-shared';

const error = new AdoError({
  message: 'Something went wrong',
  code: 'GENERIC_ERROR',
  recoverable: true,
  remediation: 'Try again or check the logs',
  cause: originalError,
});

console.log(error.message);      // "Something went wrong"
console.log(error.code);         // "GENERIC_ERROR"
console.log(error.recoverable);  // true
console.log(error.remediation);  // "Try again or check the logs"
```

#### `ConfigError`

Configuration-related errors.

```typescript
import { ConfigError } from '@dxheroes/ado-shared';

throw new ConfigError(
  'Invalid provider configuration',
  'Check your ado.config.yaml file'
);
```

#### `ProviderError`

Provider-related errors.

```typescript
import { ProviderError } from '@dxheroes/ado-shared';

throw new ProviderError('claude-code', 'Provider not available', {
  recoverable: true,
  remediation: 'Install Claude CLI: npm install -g @anthropic-ai/claude-code',
});
```

#### `RateLimitError`

Rate limit errors.

```typescript
import { RateLimitError } from '@dxheroes/ado-shared';

throw new RateLimitError('claude-code', {
  limit: 500,
  remaining: 0,
  resetAt: new Date('2025-01-14T00:00:00Z'),
  scope: 'daily',
});
```

#### `TaskError`

Task execution errors.

```typescript
import { TaskError } from '@dxheroes/ado-shared';

throw new TaskError('task-123', 'Task execution failed', {
  recoverable: true,
  remediation: 'Retry the task or check for rate limits',
  cause: originalError,
});
```

#### Error Utilities

```typescript
import { isAdoError, formatError } from '@dxheroes/ado-shared';

try {
  // Some operation
} catch (err) {
  if (isAdoError(err)) {
    console.log('ADO Error:', err.code);
    console.log('Remediation:', err.remediation);
  }

  // Format error for display
  console.error(formatError(err));
}
```

## Usage Examples

### Type-Safe Task Execution

```typescript
import type {
  AgentTask,
  AgentEvent,
  AgentAdapter,
  ProjectContext,
} from '@dxheroes/ado-shared';

const projectContext: ProjectContext = {
  projectId: 'my-project',
  repositoryPath: '/path/to/repo',
  repositoryKey: 'my-repo',
};

const task: AgentTask = {
  id: 'task-123',
  prompt: 'Implement user authentication',
  projectContext,
};

async function executeTask(adapter: AgentAdapter, task: AgentTask) {
  for await (const event of adapter.execute(task)) {
    switch (event.type) {
      case 'start':
        console.log('Task started');
        break;
      case 'output':
        console.log('Output:', event.content);
        break;
      case 'complete':
        console.log('Task completed:', event.success);
        break;
      case 'error':
        console.error('Task error:', event.error);
        break;
    }
  }
}
```

### Rate Limit Handling

```typescript
import type {
  RateLimitDetector,
  RateLimitStatus,
} from '@dxheroes/ado-shared';

async function checkRateLimit(detector: RateLimitDetector) {
  const status: RateLimitStatus = await detector.getStatus();

  if (status.isLimited) {
    console.log('Rate limited until:', status.resetAt);
    console.log('Reason:', status.reason);
    return false;
  }

  const capacity = await detector.getRemainingCapacity();
  console.log('Remaining requests today:', capacity.requestsPerDay);

  return true;
}
```

### Structured Logging

```typescript
import { createLogger } from '@dxheroes/ado-shared';

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: process.stdout.isTTY ? 'pretty' : 'json',
  prefix: 'orchestrator',
});

logger.info('Starting orchestrator', {
  providers: ['claude-code', 'gemini-cli'],
  routing: 'subscription-first',
});

try {
  await executeTask();
  logger.info('Task completed successfully');
} catch (error) {
  logger.error('Task failed', error as Error, {
    taskId: 'task-123',
  });
}
```

### Error Handling

```typescript
import {
  ConfigError,
  ProviderError,
  RateLimitError,
  TaskError,
  isAdoError,
} from '@dxheroes/ado-shared';

try {
  await loadConfig();
} catch (error) {
  if (error instanceof ConfigError) {
    console.error('Configuration error:', error.message);
    console.log('Remediation:', error.remediation);
  } else if (error instanceof ProviderError) {
    console.error('Provider error:', error.providerId, error.message);
  } else if (error instanceof RateLimitError) {
    console.error('Rate limit reached:', error.resetAt);
  } else if (error instanceof TaskError) {
    console.error('Task failed:', error.taskId, error.message);
  }

  if (isAdoError(error) && error.recoverable) {
    console.log('Error is recoverable, retrying...');
  }
}
```

## Type Guards

```typescript
import {
  isAdoError,
  isConfigError,
  isProviderError,
  isRateLimitError,
  isTaskError,
} from '@dxheroes/ado-shared';

function handleError(error: unknown) {
  if (isAdoError(error)) {
    console.log('ADO error:', error.code);
  }

  if (isConfigError(error)) {
    console.log('Config error');
  }

  if (isProviderError(error)) {
    console.log('Provider:', error.providerId);
  }

  if (isRateLimitError(error)) {
    console.log('Reset at:', error.resetAt);
  }

  if (isTaskError(error)) {
    console.log('Task:', error.taskId);
  }
}
```

## Constants

```typescript
// Default quality gates
export const DEFAULT_QUALITY_GATES = {
  build: true,
  test: true,
  lint: true,
  coverage: 80,
};

// Default checkpoint thresholds
export const DEFAULT_CHECKPOINT_THRESHOLDS = {
  maxIterations: 5,
  maxDuration: 1800000, // 30 minutes
};

// Default log level
export const DEFAULT_LOG_LEVEL = 'info';
```

## Development

```bash
# Install dependencies
pnpm install

# Build package
pnpm --filter @dxheroes/ado-shared build

# Run tests
pnpm --filter @dxheroes/ado-shared test

# Type checking
pnpm --filter @dxheroes/ado-shared typecheck

# Linting
pnpm --filter @dxheroes/ado-shared lint
```

## License

MIT © DX Heroes

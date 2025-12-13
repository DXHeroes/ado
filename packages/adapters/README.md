# @dxheroes/ado-adapters

Agent adapters for ADO (Agentic Development Orchestrator). Provides unified interfaces to multiple AI coding agents.

## Features

- **Unified Interface** - Single `AgentAdapter` interface for all providers
- **Subscription-First** - Prioritize subscription access over API billing
- **Rate Limit Detection** - Automatic detection and handling of rate limits
- **Streaming Output** - Real-time task progress via async iterators
- **OpenTelemetry** - Full observability with distributed tracing
- **Context Management** - Automatic project context injection
- **Resume Support** - Resume interrupted sessions where supported

## Installation

```bash
pnpm add @dxheroes/ado-adapters
```

## Available Adapters

### Claude Code (`claude-code`)

**Status:** ✅ Production Ready

**Installation:**
```bash
npm install -g @anthropic-ai/claude-code
```

**Capabilities:**
- Code generation, review, refactoring
- Testing and debugging
- Documentation
- Languages: TypeScript, Python, Go, Rust, Java, JavaScript, C, C++
- Max context: 200,000 tokens
- Streaming: ✅
- MCP support: ✅
- Resume: ✅

**Configuration:**
```yaml
providers:
  claude-code:
    enabled: true
    accessModes:
      - mode: subscription
        priority: 1
        subscription:
          plan: "max"  # or "pro"
          rateLimits:
            requestsPerDay: 500
            requestsPerHour: 100
      - mode: api
        priority: 10
        api:
          key: "${ANTHROPIC_API_KEY}"
    capabilities:
      codeGeneration: true
      codeReview: true
      refactoring: true
      testing: true
      documentation: true
      debugging: true
    contextFile: "CLAUDE.md"
```

**Usage:**
```typescript
import { ClaudeCodeAdapter } from '@dxheroes/ado-adapters/claude-code';

const adapter = new ClaudeCodeAdapter();

// Check availability
const isAvailable = await adapter.isAvailable();

// Initialize
await adapter.initialize({
  workingDirectory: '/path/to/project',
  projectContext: { projectId: 'my-project' },
});

// Execute task
for await (const event of adapter.execute({
  id: 'task-1',
  prompt: 'Add user authentication',
  projectContext: { projectId: 'my-project' },
})) {
  console.log(event);
}
```

### Gemini CLI (`gemini-cli`)

**Status:** 🚧 Experimental

**Installation:**
```bash
# Currently not publicly available
# Adapter ready for when Google releases Gemini CLI
```

**Capabilities:**
- Code generation and review
- Multi-modal support (code + images)
- Languages: TypeScript, Python, Go, Java, JavaScript
- Max context: 1,000,000 tokens
- Streaming: ✅

**Configuration:**
```yaml
providers:
  gemini-cli:
    enabled: false
    accessModes:
      - mode: api
        priority: 10
        api:
          key: "${GOOGLE_API_KEY}"
    contextFile: "GEMINI.md"
```

### Cursor CLI (`cursor-cli`)

**Status:** 🚧 Planned

**Installation:**
```bash
# Cursor CLI not yet available
# Adapter ready for future release
```

**Capabilities:**
- Code generation via Cursor's AI
- IDE integration
- Context-aware suggestions
- Languages: TypeScript, Python, Go, Rust, Java, JavaScript
- Streaming: ✅

**Configuration:**
```yaml
providers:
  cursor-cli:
    enabled: false
    accessModes:
      - mode: subscription
        priority: 1
        subscription:
          plan: "pro"
          rateLimits:
            requestsPerDay: 1000
    contextFile: ".cursorrules"
```

### GitHub Copilot CLI (`copilot-cli`)

**Status:** 🚧 Planned

**Installation:**
```bash
# GitHub Copilot CLI
npm install -g @githubnext/copilot-cli
```

**Capabilities:**
- Code suggestions and completions
- GitHub integration
- Languages: TypeScript, Python, Go, Rust, Java, JavaScript
- Streaming: ✅

**Configuration:**
```yaml
providers:
  copilot-cli:
    enabled: false
    accessModes:
      - mode: subscription
        priority: 1
        subscription:
          plan: "individual"  # or "business"
          rateLimits:
            requestsPerDay: 2000
    contextFile: ".github/copilot-instructions.md"
```

### OpenAI Codex CLI (`codex-cli`)

**Status:** 🚧 Planned

**Installation:**
```bash
# Custom Codex CLI wrapper
npm install -g openai-codex-cli
```

**Capabilities:**
- Code generation via GPT-4
- Function calling
- Languages: TypeScript, Python, Go, Rust, Java, JavaScript
- Max context: 128,000 tokens
- Streaming: ✅

**Configuration:**
```yaml
providers:
  codex-cli:
    enabled: false
    accessModes:
      - mode: api
        priority: 10
        api:
          key: "${OPENAI_API_KEY}"
          model: "gpt-4-turbo"
    contextFile: "CODEX.md"
```

## Provider Capabilities Matrix

| Provider | Code Gen | Review | Testing | Debugging | Refactoring | Docs | Max Context | Streaming | MCP | Resume |
|----------|----------|--------|---------|-----------|-------------|------|-------------|-----------|-----|--------|
| Claude Code | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 200K | ✅ | ✅ | ✅ |
| Gemini CLI | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 1M | ✅ | ❌ | ❌ |
| Cursor CLI | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 100K | ✅ | ❌ | ❌ |
| Copilot CLI | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | 8K | ✅ | ❌ | ❌ |
| Codex CLI | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 128K | ✅ | ❌ | ❌ |

## Creating a Custom Adapter

### 1. Implement the `AgentAdapter` Interface

```typescript
import { BaseAdapter } from '@dxheroes/ado-adapters/base';
import type {
  AgentCapabilities,
  AgentEvent,
  AgentTask,
} from '@dxheroes/ado-shared';

export class MyCustomAdapter extends BaseAdapter {
  // Unique identifier
  readonly id = 'my-custom-agent';

  // Declare capabilities
  readonly capabilities: AgentCapabilities = {
    codeGeneration: true,
    codeReview: true,
    refactoring: false,
    testing: true,
    documentation: true,
    debugging: false,
    languages: ['typescript', 'python'],
    maxContextTokens: 100000,
    supportsStreaming: true,
    supportsMCP: false,
    supportsResume: false,
  };

  // Check if agent is available
  async isAvailable(): Promise<boolean> {
    try {
      // Check if CLI is installed
      const proc = spawn('my-agent', ['--version']);
      return new Promise((resolve) => {
        proc.on('close', (code) => resolve(code === 0));
        proc.on('error', () => resolve(false));
      });
    } catch {
      return false;
    }
  }

  // Execute task
  async *execute(task: AgentTask): AsyncIterable<AgentEvent> {
    // Wrap with tracing
    yield* this.executeWithTracing(task, this.executeInternal.bind(this));
  }

  private async *executeInternal(
    task: AgentTask,
    span: Span,
  ): AsyncIterable<AgentEvent> {
    const workingDir = this.config?.workingDirectory ?? process.cwd();

    // Yield start event
    yield this.createEvent<AgentStartEvent>('start', task.id, {
      agentId: this.id,
      sessionId: this.generateSessionId(),
    });

    try {
      // Spawn agent CLI
      const proc = spawn('my-agent', [
        'run',
        '--prompt', task.prompt,
        '--cwd', workingDir,
      ]);

      // Stream output
      proc.stdout?.on('data', (data) => {
        const output = data.toString();
        // Parse and yield events
      });

      // Wait for completion
      await new Promise((resolve, reject) => {
        proc.on('close', (code) => {
          if (code === 0) resolve(undefined);
          else reject(new Error(`Exit code ${code}`));
        });
      });

      // Yield complete event
      yield this.createEvent<AgentCompleteEvent>('complete', task.id, {
        success: true,
      });
    } catch (error) {
      // Yield error event
      yield this.createEvent<AgentErrorEvent>('error', task.id, {
        error: error as Error,
      });
    }
  }

  // Interrupt execution
  async interrupt(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }

  // Get context file name
  getContextFile(): string {
    return 'MY_AGENT.md';
  }
}
```

### 2. Implement Rate Limit Detection (Optional)

```typescript
import type {
  RateLimitDetector,
  RateLimitInfo,
  RateLimitStatus,
  RemainingCapacity,
  UsageRecord,
} from '@dxheroes/ado-shared';

export class MyAgentRateLimitDetector implements RateLimitDetector {
  private usageRecords: UsageRecord[] = [];

  async getStatus(): Promise<RateLimitStatus> {
    // Check if rate limited
    const dailyUsage = this.getDailyUsage();
    const dailyLimit = 1000;

    if (dailyUsage >= dailyLimit) {
      return {
        isLimited: true,
        resetAt: this.getNextResetTime(),
        reason: 'daily_limit_reached',
      };
    }

    return { isLimited: false };
  }

  parseRateLimitError(error: Error): RateLimitInfo | null {
    // Parse rate limit errors from agent output
    const message = error.message;
    if (message.includes('rate limit exceeded')) {
      return {
        limit: 1000,
        remaining: 0,
        resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
    }
    return null;
  }

  async getRemainingCapacity(): Promise<RemainingCapacity> {
    const dailyUsage = this.getDailyUsage();
    const dailyLimit = 1000;

    return {
      requestsPerDay: dailyLimit - dailyUsage,
    };
  }

  async recordUsage(usage: UsageRecord): Promise<void> {
    this.usageRecords.push(usage);
  }

  private getDailyUsage(): number {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.usageRecords.filter(
      (r) => r.timestamp > oneDayAgo
    ).length;
  }

  private getNextResetTime(): Date {
    return new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
}
```

### 3. Register Your Adapter

Add your adapter to the adapter registry:

```typescript
import { MyCustomAdapter } from './my-custom-adapter.js';

export const adapters = {
  'claude-code': ClaudeCodeAdapter,
  'gemini-cli': GeminiCLIAdapter,
  'my-custom-agent': MyCustomAdapter,
};
```

### 4. Configure Your Adapter

Add configuration to `ado.config.yaml`:

```yaml
providers:
  my-custom-agent:
    enabled: true
    accessModes:
      - mode: subscription
        priority: 1
        subscription:
          plan: "premium"
          rateLimits:
            requestsPerDay: 1000
    capabilities:
      codeGeneration: true
      testing: true
    contextFile: "MY_AGENT.md"
```

### 5. Create Context File

Create `MY_AGENT.md` in your project root:

```markdown
# My Custom Agent Context

## Project Overview
[Project description]

## Coding Standards
- Use TypeScript strict mode
- Write tests for all new features
- Follow ESLint rules

## Architecture
[Architecture details]
```

## Testing Your Adapter

### Unit Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MyCustomAdapter } from './my-custom-adapter.js';

describe('MyCustomAdapter', () => {
  let adapter: MyCustomAdapter;

  beforeEach(() => {
    adapter = new MyCustomAdapter();
  });

  it('should have correct id', () => {
    expect(adapter.id).toBe('my-custom-agent');
  });

  it('should check availability', async () => {
    const available = await adapter.isAvailable();
    expect(typeof available).toBe('boolean');
  });

  it('should execute task and yield events', async () => {
    await adapter.initialize({
      workingDirectory: process.cwd(),
      projectContext: { projectId: 'test' },
    });

    const task = {
      id: 'task-1',
      prompt: 'Write a hello world function',
      projectContext: { projectId: 'test' },
    };

    const events = [];
    for await (const event of adapter.execute(task)) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe('start');
  });
});
```

### Integration Tests

```typescript
describe('MyCustomAdapter Integration', () => {
  it('should execute real task', async () => {
    const adapter = new MyCustomAdapter();

    if (!(await adapter.isAvailable())) {
      console.log('Skipping: agent not available');
      return;
    }

    await adapter.initialize({
      workingDirectory: '/tmp/test-project',
      projectContext: { projectId: 'integration-test' },
    });

    const task = {
      id: 'integration-task',
      prompt: 'Create a simple TypeScript function',
      projectContext: { projectId: 'integration-test' },
    };

    let completed = false;
    for await (const event of adapter.execute(task)) {
      if (event.type === 'complete') {
        completed = true;
      }
    }

    expect(completed).toBe(true);
  }, 60000); // 60s timeout
});
```

## Best Practices

### 1. Handle Errors Gracefully

```typescript
try {
  // Execute agent
} catch (error) {
  yield this.createEvent<AgentErrorEvent>('error', task.id, {
    error: error as Error,
  });
}
```

### 2. Implement Progress Tracking

```typescript
yield this.createEvent<AgentProgressEvent>('progress', task.id, {
  progress: 50,
  message: 'Halfway through implementation',
});
```

### 3. Support Interruption

```typescript
async interrupt(): Promise<void> {
  if (this.process) {
    this.process.kill('SIGTERM');

    // Wait for graceful shutdown
    await new Promise((resolve) => {
      this.process?.on('exit', resolve);
      setTimeout(resolve, 5000); // Force after 5s
    });

    this.process = null;
  }
}
```

### 4. Parse Output Properly

```typescript
private parseAgentOutput(line: string): AgentEvent | null {
  // Parse JSON output
  if (line.startsWith('{')) {
    try {
      const data = JSON.parse(line);
      return this.createEvent(data.type, task.id, data);
    } catch {
      return null;
    }
  }

  // Parse plain text output
  return this.createEvent<AgentOutputEvent>('output', task.id, {
    output: line,
  });
}
```

### 5. Use OpenTelemetry Tracing

```typescript
async *execute(task: AgentTask): AsyncIterable<AgentEvent> {
  // Always wrap with tracing
  yield* this.executeWithTracing(task, this.executeInternal.bind(this));
}
```

## API Reference

### AgentAdapter Interface

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

### AgentCapabilities

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

### AgentEvent Types

```typescript
type AgentEvent =
  | AgentStartEvent
  | AgentOutputEvent
  | AgentProgressEvent
  | AgentCompleteEvent
  | AgentErrorEvent
  | AgentInterruptEvent;
```

## Development

```bash
# Install dependencies
pnpm install

# Build adapters
pnpm --filter @dxheroes/ado-adapters build

# Run tests
pnpm --filter @dxheroes/ado-adapters test

# Type checking
pnpm --filter @dxheroes/ado-adapters typecheck

# Linting
pnpm --filter @dxheroes/ado-adapters lint
```

## Contributing

To contribute a new adapter:

1. Create adapter class in `src/<agent-name>/adapter.ts`
2. Implement `AgentAdapter` interface
3. Add rate limit detector if needed
4. Write unit and integration tests
5. Update this README with provider details
6. Submit pull request

## License

MIT © DX Heroes

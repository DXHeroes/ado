# Agent Adapter Interface

## Přehled

Definice rozhraní pro implementaci adaptérů AI agentů. Všechny adaptéry musí implementovat toto rozhraní pro integraci s ADO orchestrátorem.

## Interface Definition

```typescript
/**
 * Base interface for all AI agent adapters.
 * Implementors must provide all methods defined here.
 */
interface AgentAdapter {
  // ═══════════════════════════════════════════════════════
  // IDENTIFICATION
  // ═══════════════════════════════════════════════════════

  /**
   * Unique identifier for this adapter.
   * Must be lowercase, alphanumeric with hyphens.
   * Example: 'claude-code', 'gemini-cli'
   */
  readonly id: string;

  /**
   * Human-readable name.
   * Example: 'Claude Code', 'Gemini CLI'
   */
  readonly name: string;

  /**
   * Adapter version (semver).
   * Example: '1.0.0'
   */
  readonly version: string;

  // ═══════════════════════════════════════════════════════
  // CAPABILITIES
  // ═══════════════════════════════════════════════════════

  /**
   * Agent capabilities.
   * Used for task routing and capability matching.
   */
  readonly capabilities: AgentCapabilities;

  /**
   * Supported access modes (subscription, API, local).
   * Ordered by priority (first = highest priority).
   */
  readonly accessModes: AccessMode[];

  // ═══════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════

  /**
   * Initialize the adapter with configuration.
   * Called once when the adapter is registered.
   *
   * @throws AdapterInitializationError if initialization fails
   */
  initialize(config: AgentConfig): Promise<void>;

  /**
   * Gracefully shutdown the adapter.
   * Should cleanup any resources (processes, connections).
   */
  shutdown(): Promise<void>;

  // ═══════════════════════════════════════════════════════
  // AVAILABILITY
  // ═══════════════════════════════════════════════════════

  /**
   * Check if the agent is available for use.
   * Should verify binary exists, authentication is valid, etc.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get current access mode status.
   * Returns which mode is active and current limits.
   */
  getAccessMode(): Promise<AccessModeStatus>;

  /**
   * Perform a health check.
   * Used for monitoring and diagnostics.
   */
  healthCheck(): Promise<HealthStatus>;

  // ═══════════════════════════════════════════════════════
  // EXECUTION
  // ═══════════════════════════════════════════════════════

  /**
   * Execute a task with the agent.
   * Returns an async iterable of events for streaming output.
   *
   * @param task - The task to execute
   * @yields AgentEvent - Stream of events during execution
   */
  execute(task: AgentTask): AsyncIterable<AgentEvent>;

  /**
   * Interrupt a running execution.
   * Should gracefully stop the agent process.
   */
  interrupt(): Promise<void>;

  // ═══════════════════════════════════════════════════════
  // RATE LIMITING
  // ═══════════════════════════════════════════════════════

  /**
   * Get the rate limit detector for this agent.
   * Used to detect when the agent hits rate limits.
   */
  getRateLimitDetector(): RateLimitDetector;
}
```

## Supporting Types

### AgentCapabilities

```typescript
/**
 * Capabilities of an AI agent.
 */
interface AgentCapabilities {
  /** Can generate new code */
  codeGeneration: boolean;

  /** Can review existing code */
  codeReview: boolean;

  /** Can refactor code */
  refactoring: boolean;

  /** Can write tests */
  testing: boolean;

  /** Can write documentation */
  documentation: boolean;

  /** Can debug issues */
  debugging: boolean;

  /** Can work with multiple files */
  multiFile: boolean;

  /** Can understand project context */
  projectContext: boolean;

  /** Can search the web */
  webSearch: boolean;

  /** Maximum context window in tokens */
  maxContextTokens: number;

  /** Additional custom capabilities */
  custom?: Record<string, boolean>;
}
```

### AccessMode

```typescript
/**
 * Access mode configuration.
 */
type AccessMode =
  | SubscriptionAccessMode
  | APIAccessMode
  | LocalAccessMode;

interface SubscriptionAccessMode {
  type: 'subscription';
  priority: number;
  enabled: boolean;
  subscription: {
    plan: string;           // 'max', 'pro', 'free', etc.
    rateLimits: RateLimits;
  };
}

interface APIAccessMode {
  type: 'api';
  priority: number;
  enabled: boolean;
  api: {
    model: string;          // Model identifier
    pricing: Pricing;
    maxTokens: number;
    endpoint?: string;      // Custom endpoint
    apiKeyEnvVar?: string;  // Environment variable for API key
  };
}

interface LocalAccessMode {
  type: 'local';
  priority: number;
  enabled: boolean;
  local: {
    model: string;
    endpoint: string;       // Local server endpoint
  };
}

interface RateLimits {
  requestsPerMinute?: number;
  requestsPerHour?: number;
  requestsPerDay?: number;
  tokensPerDay?: number;
}

interface Pricing {
  inputPer1kTokens: number;
  outputPer1kTokens: number;
  currency: string;
}
```

### AgentConfig

```typescript
/**
 * Configuration passed to adapter during initialization.
 */
interface AgentConfig {
  /** Working directory for the agent */
  workingDirectory: string;

  /** Context file path (CLAUDE.md, GEMINI.md, etc.) */
  contextFile?: string;

  /** Environment variables to pass to agent */
  env?: Record<string, string>;

  /** Access mode configuration */
  accessModes: AccessMode[];

  /** Logging configuration */
  logging?: {
    level: 'debug' | 'info' | 'warn' | 'error';
    destination?: string;
  };

  /** Custom configuration */
  custom?: Record<string, unknown>;
}
```

### AgentTask

```typescript
/**
 * Task to be executed by the agent.
 */
interface AgentTask {
  /** Task ID */
  taskId: string;

  /** The prompt/instruction for the agent */
  prompt: string;

  /** Working directory */
  workingDirectory: string;

  /** Environment variables */
  env?: Record<string, string>;

  /** Maximum turns/iterations */
  maxTurns?: number;

  /** Timeout in milliseconds */
  timeout?: number;

  /** Files to focus on */
  files?: string[];

  /** Continue from previous conversation */
  continueFrom?: string;

  /** Custom parameters */
  params?: Record<string, unknown>;
}
```

### AgentEvent

```typescript
/**
 * Events emitted during agent execution.
 */
type AgentEvent =
  | OutputEvent
  | ThinkingEvent
  | ToolCallEvent
  | ToolResultEvent
  | FileChangeEvent
  | ProgressEvent
  | CompletedEvent
  | ErrorEvent;

interface OutputEvent {
  type: 'output';
  stream: 'stdout' | 'stderr';
  data: string;
}

interface ThinkingEvent {
  type: 'thinking';
  content: string;
  tokensUsed?: number;
}

interface ToolCallEvent {
  type: 'tool_call';
  tool: string;
  input: unknown;
}

interface ToolResultEvent {
  type: 'tool_result';
  tool: string;
  output: unknown;
  success: boolean;
  duration: number;
}

interface FileChangeEvent {
  type: 'file_change';
  path: string;
  action: 'create' | 'modify' | 'delete';
  diff?: string;
}

interface ProgressEvent {
  type: 'progress';
  message: string;
  percentage?: number;
}

interface CompletedEvent {
  type: 'completed';
  result: {
    success: boolean;
    output?: string;
    filesChanged: string[];
    tokensUsed: number;
    cost: number;
  };
}

interface ErrorEvent {
  type: 'error';
  error: {
    code: string;
    message: string;
    recoverable: boolean;
  };
}
```

### AccessModeStatus

```typescript
/**
 * Current status of access mode.
 */
interface AccessModeStatus {
  type: AccessModeType;
  status: 'available' | 'rate_limited' | 'unavailable';

  current?: {
    requests: number;
    tokens: number;
  };

  limits?: RateLimits;
  resetAt?: Date;
  estimatedWait?: number;
}
```

### HealthStatus

```typescript
/**
 * Health check result.
 */
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  lastCheck: Date;
  error?: string;

  details?: {
    binaryFound: boolean;
    binaryVersion?: string;
    authenticated: boolean;
    rateLimitRemaining?: number;
    customChecks?: Record<string, boolean>;
  };
}
```

### RateLimitDetector

```typescript
/**
 * Detector for rate limit conditions.
 */
interface RateLimitDetector {
  /** Patterns to detect rate limiting in output */
  patterns: RegExp[];

  /**
   * Check if output indicates rate limiting.
   */
  detect(output: string): boolean;

  /**
   * Extract wait time from rate limit message.
   * @returns Wait time in seconds, or null if not extractable
   */
  extractWaitTime(output: string): number | null;
}
```

## Abstract Base Class

```typescript
/**
 * Abstract base class with common functionality.
 * Extend this class to implement new adapters.
 */
abstract class BaseAgentAdapter implements AgentAdapter {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly capabilities: AgentCapabilities;
  abstract readonly accessModes: AccessMode[];

  protected config!: AgentConfig;
  protected process?: ChildProcess;
  protected isInitialized = false;

  async initialize(config: AgentConfig): Promise<void> {
    this.config = config;
    await this.validateConfig();
    await this.setup();
    this.isInitialized = true;
  }

  async shutdown(): Promise<void> {
    if (this.process) {
      await this.interrupt();
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const binaryPath = await this.findBinary();
      return binaryPath !== null;
    } catch {
      return false;
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      const binaryFound = await this.isAvailable();
      const version = binaryFound ? await this.getVersion() : undefined;
      const authenticated = binaryFound ? await this.checkAuth() : false;

      return {
        status: binaryFound && authenticated ? 'healthy' : 'unhealthy',
        latency: Date.now() - startTime,
        lastCheck: new Date(),
        details: {
          binaryFound,
          binaryVersion: version,
          authenticated,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: Date.now() - startTime,
        lastCheck: new Date(),
        error: (error as Error).message,
      };
    }
  }

  async interrupt(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');

      // Wait for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Force kill if still running
      if (this.process && !this.process.killed) {
        this.process.kill('SIGKILL');
      }

      this.process = undefined;
    }
  }

  // Abstract methods to be implemented
  protected abstract findBinary(): Promise<string | null>;
  protected abstract getVersion(): Promise<string>;
  protected abstract checkAuth(): Promise<boolean>;
  protected abstract buildCommand(task: AgentTask): { command: string; args: string[] };
  protected abstract parseOutput(line: string): AgentEvent | null;
  abstract getAccessMode(): Promise<AccessModeStatus>;
  abstract execute(task: AgentTask): AsyncIterable<AgentEvent>;
  abstract getRateLimitDetector(): RateLimitDetector;

  // Helper methods
  protected async validateConfig(): Promise<void> {
    if (!this.config.workingDirectory) {
      throw new Error('Working directory is required');
    }
  }

  protected async setup(): Promise<void> {
    // Override in subclass for custom setup
  }

  protected async* streamProcess(
    task: AgentTask
  ): AsyncIterable<AgentEvent> {
    const { command, args } = this.buildCommand(task);

    this.process = spawn(command, args, {
      cwd: task.workingDirectory,
      env: { ...process.env, ...task.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const rl = readline.createInterface({
      input: this.process.stdout!,
    });

    for await (const line of rl) {
      const event = this.parseOutput(line);
      if (event) {
        yield event;
      }
    }

    // Handle stderr
    this.process.stderr!.on('data', (data) => {
      // Log or emit error events
    });

    // Wait for process to complete
    await new Promise<void>((resolve, reject) => {
      this.process!.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Process exited with code ${code}`));
        }
      });
    });
  }
}
```

## Implementation Example

```typescript
/**
 * Example implementation for Claude Code.
 */
class ClaudeCodeAdapter extends BaseAgentAdapter {
  readonly id = 'claude-code';
  readonly name = 'Claude Code';
  readonly version = '1.0.0';

  readonly capabilities: AgentCapabilities = {
    codeGeneration: true,
    codeReview: true,
    refactoring: true,
    testing: true,
    documentation: true,
    debugging: true,
    multiFile: true,
    projectContext: true,
    webSearch: true,
    maxContextTokens: 200_000,
  };

  readonly accessModes: AccessMode[] = [
    {
      type: 'subscription',
      priority: 1,
      enabled: true,
      subscription: {
        plan: 'max',
        rateLimits: {
          requestsPerHour: 100,
          tokensPerDay: 5_000_000,
        },
      },
    },
    {
      type: 'api',
      priority: 2,
      enabled: true,
      api: {
        model: 'claude-sonnet-4-20250514',
        pricing: {
          inputPer1kTokens: 0.003,
          outputPer1kTokens: 0.015,
          currency: 'USD',
        },
        maxTokens: 200_000,
        apiKeyEnvVar: 'ANTHROPIC_API_KEY',
      },
    },
  ];

  protected async findBinary(): Promise<string | null> {
    try {
      const { stdout } = await execAsync('which claude');
      return stdout.trim();
    } catch {
      return null;
    }
  }

  protected async getVersion(): Promise<string> {
    const { stdout } = await execAsync('claude --version');
    const match = stdout.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : 'unknown';
  }

  protected async checkAuth(): Promise<boolean> {
    try {
      await execAsync('claude auth status');
      return true;
    } catch {
      return false;
    }
  }

  async getAccessMode(): Promise<AccessModeStatus> {
    // Check subscription status first
    const isSubscriptionAvailable = await this.checkSubscription();

    if (isSubscriptionAvailable) {
      return {
        type: 'subscription',
        status: 'available',
        current: await this.getUsage(),
        limits: this.accessModes[0].subscription!.rateLimits,
      };
    }

    // Fall back to API
    return {
      type: 'api',
      status: 'available',
    };
  }

  protected buildCommand(task: AgentTask): { command: string; args: string[] } {
    const args = [
      '--print',
      '--output-format', 'stream-json',
    ];

    if (task.maxTurns) {
      args.push('--max-turns', String(task.maxTurns));
    }

    if (task.continueFrom) {
      args.push('--continue', task.continueFrom);
    }

    args.push(task.prompt);

    return { command: 'claude', args };
  }

  protected parseOutput(line: string): AgentEvent | null {
    try {
      const json = JSON.parse(line);

      switch (json.type) {
        case 'assistant':
          return { type: 'output', stream: 'stdout', data: json.content };

        case 'tool_use':
          return { type: 'tool_call', tool: json.name, input: json.input };

        case 'tool_result':
          return {
            type: 'tool_result',
            tool: json.tool,
            output: json.output,
            success: json.success,
            duration: json.duration,
          };

        case 'result':
          return {
            type: 'completed',
            result: {
              success: json.success,
              output: json.output,
              filesChanged: json.files_changed || [],
              tokensUsed: json.tokens_used || 0,
              cost: json.cost || 0,
            },
          };

        default:
          return null;
      }
    } catch {
      // Plain text output
      return { type: 'output', stream: 'stdout', data: line };
    }
  }

  async *execute(task: AgentTask): AsyncIterable<AgentEvent> {
    yield* this.streamProcess(task);
  }

  getRateLimitDetector(): RateLimitDetector {
    return {
      patterns: [
        /rate.?limit/i,
        /too many requests/i,
        /quota exceeded/i,
        /try again later/i,
        /429/,
      ],

      detect(output: string): boolean {
        return this.patterns.some(p => p.test(output));
      },

      extractWaitTime(output: string): number | null {
        const match = output.match(/wait\s+(\d+)\s*(seconds?|minutes?|hours?)/i);
        if (!match) return 60; // Default 60 seconds

        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();

        if (unit.startsWith('minute')) return value * 60;
        if (unit.startsWith('hour')) return value * 3600;
        return value;
      },
    };
  }

  private async checkSubscription(): Promise<boolean> {
    // Implementation specific
    return true;
  }

  private async getUsage(): Promise<{ requests: number; tokens: number }> {
    // Implementation specific
    return { requests: 0, tokens: 0 };
  }
}
```

## Registration

```typescript
// Register adapter with the registry
const registry = new AgentRegistry();

const claudeAdapter = new ClaudeCodeAdapter();
await claudeAdapter.initialize(config);

registry.register(claudeAdapter);
```

---

## Souvislosti

- [Agent Adapters Component](../../03-architecture/03-component-diagrams/agent-adapters.md)
- [Providers tRPC Procedures](../01-trpc-procedures/providers.md)
- [Agent WebSocket Events](../02-websocket-events/agent-events.md)

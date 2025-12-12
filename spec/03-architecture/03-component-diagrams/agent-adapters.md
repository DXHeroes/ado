# Agent Adapters - Component Diagram

## Přehled

C4 Level 3 diagram komponent pro adaptéry AI agentů. Každý adaptér implementuje společné rozhraní a zapouzdřuje specifickou logiku pro komunikaci s konkrétním agentem.

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AGENT ADAPTER LAYER                                │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Agent Registry                                │    │
│  │                                                                      │    │
│  │  - register(adapter)    - getAdapter(id)    - listAvailable()       │    │
│  │  - unregister(id)       - getCapabilities() - healthCheck()         │    │
│  └──────────────────────────────────┬──────────────────────────────────┘    │
│                                     │                                        │
│         ┌───────────────────────────┼───────────────────────────┐           │
│         │                           │                           │           │
│         ▼                           ▼                           ▼           │
│  ┌─────────────┐           ┌─────────────┐           ┌─────────────┐        │
│  │ Claude Code │           │ Gemini CLI  │           │ Cursor CLI  │        │
│  │   Adapter   │           │   Adapter   │           │   Adapter   │        │
│  └──────┬──────┘           └──────┬──────┘           └──────┬──────┘        │
│         │                         │                         │               │
│         ▼                         ▼                         ▼               │
│  ┌─────────────┐           ┌─────────────┐           ┌─────────────┐        │
│  │ Copilot CLI │           │  Codex CLI  │           │   Custom    │        │
│  │   Adapter   │           │   Adapter   │           │   Adapter   │        │
│  └─────────────┘           └─────────────┘           └─────────────┘        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     Base Adapter (Abstract)                          │    │
│  │                                                                      │    │
│  │  + id: string                    + initialize(): Promise<void>      │    │
│  │  + capabilities: Capabilities    + execute(): AsyncIterable<Event>  │    │
│  │  + accessModes: AccessMode[]     + interrupt(): Promise<void>       │    │
│  │  # spawnProcess(): Process       + isAvailable(): Promise<boolean>  │    │
│  │  # parseOutput(): Event          + getRateLimitDetector(): Detector │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Base Adapter Interface

```typescript
interface AgentAdapter {
  // Identifikace
  readonly id: string;
  readonly name: string;
  readonly version: string;

  // Schopnosti
  readonly capabilities: AgentCapabilities;

  // Přístupové módy
  readonly accessModes: AccessMode[];

  // Lifecycle
  initialize(config: AgentConfig): Promise<void>;
  shutdown(): Promise<void>;

  // Dostupnost
  isAvailable(): Promise<boolean>;
  getAccessMode(): Promise<AccessModeStatus>;

  // Exekuce
  execute(task: AgentTask): AsyncIterable<AgentEvent>;
  interrupt(): Promise<void>;

  // Rate limiting
  getRateLimitDetector(): RateLimitDetector;

  // Health
  healthCheck(): Promise<HealthStatus>;
}

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

type AccessMode =
  | { type: 'subscription'; plan: string; limits: RateLimits }
  | { type: 'api'; model: string; pricing: Pricing }
  | { type: 'local'; model: string };
```

## Implementace adaptérů

### 1. Claude Code Adapter

```typescript
class ClaudeCodeAdapter implements AgentAdapter {
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
      plan: 'max',
      limits: { requestsPerHour: 100, tokensPerDay: 5_000_000 }
    },
    {
      type: 'api',
      model: 'claude-sonnet-4-20250514',
      pricing: { inputPer1k: 0.003, outputPer1k: 0.015 }
    }
  ];

  private process?: ChildProcess;
  private contextFile = 'CLAUDE.md';

  async execute(task: AgentTask): AsyncIterable<AgentEvent> {
    const args = this.buildArgs(task);
    this.process = spawn('claude', args, {
      cwd: task.workingDirectory,
      env: { ...process.env, ...task.env },
    });

    yield* this.streamOutput(this.process);
  }

  private buildArgs(task: AgentTask): string[] {
    return [
      '--print',
      '--output-format', 'stream-json',
      '--max-turns', String(task.maxTurns ?? 50),
      task.prompt,
    ];
  }

  getRateLimitDetector(): RateLimitDetector {
    return {
      patterns: [
        /rate.?limit/i,
        /too many requests/i,
        /quota exceeded/i,
        /try again later/i,
      ],
      detect: (output) => this.patterns.some(p => p.test(output)),
      extractWaitTime: (output) => {
        const match = output.match(/wait (\d+) (seconds?|minutes?)/i);
        if (match) {
          const value = parseInt(match[1]);
          return match[2].startsWith('minute') ? value * 60 : value;
        }
        return 60; // default
      },
    };
  }
}
```

### 2. Gemini CLI Adapter

```typescript
class GeminiCliAdapter implements AgentAdapter {
  readonly id = 'gemini-cli';
  readonly name = 'Gemini CLI';
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
    maxContextTokens: 1_000_000,
  };

  readonly accessModes: AccessMode[] = [
    {
      type: 'subscription',
      plan: 'advanced',
      limits: { requestsPerHour: 50, tokensPerDay: 10_000_000 }
    },
    {
      type: 'api',
      model: 'gemini-2.0-flash',
      pricing: { inputPer1k: 0.0001, outputPer1k: 0.0004 }
    }
  ];

  private contextFile = 'GEMINI.md';

  async execute(task: AgentTask): AsyncIterable<AgentEvent> {
    const args = [
      '--non-interactive',
      '--output-format', 'json',
      '-p', task.prompt,
    ];

    const proc = spawn('gemini', args, {
      cwd: task.workingDirectory,
    });

    yield* this.streamOutput(proc);
  }
}
```

### 3. Cursor CLI Adapter

```typescript
class CursorCliAdapter implements AgentAdapter {
  readonly id = 'cursor-cli';
  readonly name = 'Cursor CLI';
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
    webSearch: false,
    maxContextTokens: 128_000,
  };

  readonly accessModes: AccessMode[] = [
    {
      type: 'subscription',
      plan: 'pro',
      limits: { requestsPerHour: 500, tokensPerDay: 50_000_000 }
    }
  ];

  async execute(task: AgentTask): AsyncIterable<AgentEvent> {
    // Cursor specifická implementace
    const args = ['agent', '--prompt', task.prompt];
    const proc = spawn('cursor', args, {
      cwd: task.workingDirectory,
    });

    yield* this.streamOutput(proc);
  }
}
```

### 4. GitHub Copilot Adapter

```typescript
class CopilotCliAdapter implements AgentAdapter {
  readonly id = 'copilot-cli';
  readonly name = 'GitHub Copilot';
  readonly version = '1.0.0';

  readonly capabilities: AgentCapabilities = {
    codeGeneration: true,
    codeReview: false,
    refactoring: true,
    testing: false,
    documentation: false,
    debugging: false,
    multiFile: false,
    projectContext: true,
    webSearch: false,
    maxContextTokens: 32_000,
  };

  readonly accessModes: AccessMode[] = [
    {
      type: 'subscription',
      plan: 'individual',
      limits: { requestsPerHour: 100, tokensPerDay: 1_000_000 }
    }
  ];
}
```

### 5. Codex CLI Adapter

```typescript
class CodexCliAdapter implements AgentAdapter {
  readonly id = 'codex-cli';
  readonly name = 'OpenAI Codex';
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
    webSearch: false,
    maxContextTokens: 128_000,
  };

  readonly accessModes: AccessMode[] = [
    {
      type: 'api',
      model: 'gpt-4o',
      pricing: { inputPer1k: 0.005, outputPer1k: 0.015 }
    }
  ];
}
```

## Agent Registry

```typescript
class AgentRegistry {
  private adapters = new Map<string, AgentAdapter>();

  // Registrace adaptéru
  register(adapter: AgentAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Adapter ${adapter.id} already registered`);
    }
    this.adapters.set(adapter.id, adapter);
  }

  // Odregistrace
  unregister(id: string): boolean {
    return this.adapters.delete(id);
  }

  // Získání adaptéru
  getAdapter(id: string): AgentAdapter | undefined {
    return this.adapters.get(id);
  }

  // Seznam dostupných
  async listAvailable(): Promise<AgentAdapter[]> {
    const available: AgentAdapter[] = [];

    for (const adapter of this.adapters.values()) {
      if (await adapter.isAvailable()) {
        available.push(adapter);
      }
    }

    return available;
  }

  // Schopnosti všech agentů
  getCapabilities(): Map<string, AgentCapabilities> {
    const caps = new Map();
    for (const [id, adapter] of this.adapters) {
      caps.set(id, adapter.capabilities);
    }
    return caps;
  }

  // Health check všech
  async healthCheck(): Promise<Map<string, HealthStatus>> {
    const results = new Map();

    await Promise.all(
      Array.from(this.adapters.entries()).map(async ([id, adapter]) => {
        results.set(id, await adapter.healthCheck());
      })
    );

    return results;
  }
}
```

## Provider Router

Vybírá nejvhodnějšího agenta pro úkol.

```typescript
class ProviderRouter {
  constructor(
    private registry: AgentRegistry,
    private config: ProviderConfig[]
  ) {}

  // Výběr providera pro úkol
  async selectProvider(task: AgentTask): Promise<AgentAdapter> {
    const candidates = await this.getCandidates(task);

    if (candidates.length === 0) {
      throw new NoProviderAvailableError(task);
    }

    // Seřazení podle priority a dostupnosti
    const sorted = this.sortByPriority(candidates, task);

    return sorted[0].adapter;
  }

  private async getCandidates(task: AgentTask): Promise<Candidate[]> {
    const candidates: Candidate[] = [];

    for (const config of this.config) {
      if (!config.enabled) continue;

      const adapter = this.registry.getAdapter(config.id);
      if (!adapter) continue;

      // Kontrola schopností
      if (!this.hasRequiredCapabilities(adapter, task)) continue;

      // Kontrola dostupnosti
      const accessMode = await adapter.getAccessMode();
      if (accessMode.status !== 'available') continue;

      candidates.push({
        adapter,
        config,
        accessMode,
        score: this.calculateScore(adapter, task, accessMode),
      });
    }

    return candidates;
  }

  private calculateScore(
    adapter: AgentAdapter,
    task: AgentTask,
    accessMode: AccessModeStatus
  ): number {
    let score = 0;

    // Priorita subscription > api
    if (accessMode.type === 'subscription') score += 100;

    // Priorita z konfigurace
    score += (10 - (adapter.config?.priority ?? 5)) * 10;

    // Bonus za specifické schopnosti
    if (task.requiresWebSearch && adapter.capabilities.webSearch) {
      score += 20;
    }

    return score;
  }
}
```

## Output Parsing

```typescript
// Společný parser pro streamovaný výstup
interface OutputParser {
  parse(line: string): AgentEvent | null;
}

class ClaudeOutputParser implements OutputParser {
  parse(line: string): AgentEvent | null {
    try {
      const json = JSON.parse(line);

      switch (json.type) {
        case 'assistant':
          return {
            type: 'output',
            stream: 'stdout',
            data: json.content,
          };
        case 'tool_use':
          return {
            type: 'tool_call',
            tool: json.name,
            input: json.input,
          };
        case 'result':
          return {
            type: 'completed',
            result: json,
          };
        default:
          return null;
      }
    } catch {
      // Plain text output
      return {
        type: 'output',
        stream: 'stdout',
        data: line,
      };
    }
  }
}
```

## Testování

```typescript
// Mock adapter pro testy
class MockAgentAdapter implements AgentAdapter {
  readonly id = 'mock';
  readonly name = 'Mock Agent';
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
    webSearch: false,
    maxContextTokens: 100_000,
  };

  private responses: AgentEvent[] = [];

  setResponses(responses: AgentEvent[]): void {
    this.responses = responses;
  }

  async *execute(task: AgentTask): AsyncIterable<AgentEvent> {
    for (const response of this.responses) {
      yield response;
      await delay(10); // Simulate latency
    }
  }
}
```

---

## Souvislosti

- [Base Adapter Interface](../../05-api/03-agent-adapter-interface/base-adapter.md)
- [Orchestrator Core](./orchestrator-core.md)
- [FR-001: Autonomous Execution](../../02-requirements/01-functional/FR-001-autonomous-execution.md)

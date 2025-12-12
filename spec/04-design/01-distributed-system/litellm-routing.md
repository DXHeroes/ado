# LiteLLM Routing Design

## Přehled

Architektonický design pro integraci LiteLLM jako unified model router pro ADO - umožňuje přístup k 100+ LLM providerům přes jednotné API s cost tracking, load balancing a automatic failover.

## Proč LiteLLM?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Model Router Comparison                                   │
└─────────────────────────────────────────────────────────────────────────────┘

                    Direct APIs       LangChain         LiteLLM
                    ───────────       ─────────         ───────
Unified Interface   No                Partial           Yes
Provider Count      1 per SDK         ~20               100+
Cost Tracking       Manual            No                Built-in
Load Balancing      Manual            No                Built-in
Failover            Manual            No                Automatic
OpenTelemetry       Manual            No                Built-in
OpenAI-compatible   Varies            No                Yes
Production-ready    Varies            Framework only    Yes

Key Advantages:
- Write once, route to any provider (Claude, GPT-4, Gemini, Ollama, etc.)
- Automatic cost calculation and budget enforcement
- Built-in retry logic with exponential backoff
- Native OpenTelemetry tracing for LLM calls
- Fallback chains: primary → secondary → tertiary
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LiteLLM Integration Architecture                      │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              ADO Orchestrator                                │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     Subscription-First Router                          │  │
│  │                                                                        │  │
│  │  1. Check subscription limits (Claude MAX, Cursor Pro, etc.)          │  │
│  │  2. If subscription available → use subscription adapter              │  │
│  │  3. If subscription exhausted → route to LiteLLM                      │  │
│  └────────────────────────────────┬──────────────────────────────────────┘  │
│                                   │                                         │
│                                   ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                          LiteLLM Router                                │  │
│  │                                                                        │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │  │
│  │  │ Cost Tracker │  │Load Balancer │  │Fallback Chain│               │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │  │
│  │                                                                        │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │              Unified OpenAI-Compatible API                       │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────┬──────────────────────────────────────┘  │
│                                   │                                         │
└───────────────────────────────────┼─────────────────────────────────────────┘
                                    │
                ┌───────────────────┼───────────────────┐
                │                   │                   │
                ▼                   ▼                   ▼
         ┌─────────────┐     ┌─────────────┐   ┌─────────────┐
         │  Anthropic  │     │   OpenAI    │   │   Google    │
         │   Claude    │     │   GPT-4     │   │   Gemini    │
         └─────────────┘     └─────────────┘   └─────────────┘
                │                   │                   │
         ┌─────────────┐     ┌─────────────┐   ┌─────────────┐
         │   Mistral   │     │   Ollama    │   │   Groq      │
         │    API      │     │   (local)   │   │   LLaMA     │
         └─────────────┘     └─────────────┘   └─────────────┘
```

## Unified API Interface

### LiteLLM Client

```typescript
// packages/core/src/llm/litellm-client.ts
import { LiteLLM } from 'litellm';
import { z } from 'zod';

export interface LiteLLMConfig {
  // Primary provider
  primaryModel: string; // "claude-sonnet-4-5-20250929"

  // Fallback chain
  fallbackModels?: string[]; // ["gpt-4o", "gemini-2.0-flash-exp"]

  // Cost management
  maxCostPerTask?: number; // USD
  budgetAlertThreshold?: number; // 0.8 = 80%

  // Performance
  timeout?: number; // milliseconds
  maxRetries?: number;

  // Observability
  enableTracing?: boolean;
}

export class LiteLLMClient {
  private client: LiteLLM;
  private costTracker: CostTracker;
  private config: LiteLLMConfig;

  constructor(config: LiteLLMConfig) {
    this.config = config;

    // Initialize LiteLLM with fallback chain
    this.client = new LiteLLM({
      model: config.primaryModel,
      fallbacks: config.fallbackModels || [],
      timeout: config.timeout || 60000,
      max_retries: config.maxRetries || 3,

      // Callbacks for observability
      success_callback: this.onSuccess.bind(this),
      failure_callback: this.onFailure.bind(this),
    });

    this.costTracker = new CostTracker(config.maxCostPerTask);
  }

  /**
   * Send chat completion request with automatic provider routing
   */
  async chat(
    messages: ChatMessage[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    // Check budget before call
    await this.costTracker.checkBudget();

    const startTime = Date.now();

    try {
      const response = await this.client.completion({
        model: options?.model || this.config.primaryModel,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens,
        stream: options?.stream ?? false,
      });

      // Track cost
      const cost = this.calculateCost(response);
      await this.costTracker.recordUsage(cost);

      return {
        content: response.choices[0].message.content,
        model: response.model,
        usage: response.usage,
        cost,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      // LiteLLM handles fallback automatically
      throw new LLMError('Chat completion failed after all fallbacks', {
        cause: error,
      });
    }
  }

  /**
   * Stream chat completion with automatic provider routing
   */
  async *chatStream(
    messages: ChatMessage[],
    options?: ChatOptions
  ): AsyncIterable<ChatStreamChunk> {
    await this.costTracker.checkBudget();

    const stream = await this.client.completion({
      model: options?.model || this.config.primaryModel,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
      stream: true,
    });

    let totalTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield {
          content: delta,
          model: chunk.model,
        };
      }

      // Track usage incrementally
      if (chunk.usage) {
        totalTokens = chunk.usage.total_tokens;
      }
    }

    // Record final cost
    const cost = this.estimateCostFromTokens(totalTokens);
    await this.costTracker.recordUsage(cost);
  }

  private calculateCost(response: any): number {
    // LiteLLM provides cost calculation
    return response._hidden_params?.response_cost || 0;
  }

  private estimateCostFromTokens(tokens: number): number {
    // Provider-specific pricing
    const pricing = this.getPricing(this.config.primaryModel);
    return (tokens / 1000) * pricing.perThousandTokens;
  }

  private onSuccess(response: any): void {
    // OpenTelemetry tracing
    if (this.config.enableTracing) {
      this.recordTrace('llm.completion.success', {
        model: response.model,
        tokens: response.usage.total_tokens,
        cost: response._hidden_params?.response_cost,
      });
    }
  }

  private onFailure(error: any): void {
    // Log failure for debugging
    if (this.config.enableTracing) {
      this.recordTrace('llm.completion.failure', {
        error: error.message,
        model: this.config.primaryModel,
      });
    }
  }
}
```

## Cost Tracking and Budget Management

```typescript
// packages/core/src/llm/cost-tracker.ts
export interface CostBudget {
  maxCostPerTask: number; // USD
  maxCostPerDay?: number;
  maxCostPerMonth?: number;
  alertThreshold: number; // 0.0-1.0
}

export class CostTracker {
  private currentTaskCost = 0;
  private dailyCost = 0;
  private monthlyCost = 0;
  private budget: CostBudget;

  constructor(maxCostPerTask?: number) {
    this.budget = {
      maxCostPerTask: maxCostPerTask || 10, // $10 default
      alertThreshold: 0.8, // 80%
    };
  }

  async checkBudget(): Promise<void> {
    if (this.currentTaskCost >= this.budget.maxCostPerTask) {
      throw new BudgetExceededError(
        `Task budget exceeded: $${this.currentTaskCost.toFixed(4)} / $${this.budget.maxCostPerTask}`
      );
    }

    // Check alert threshold
    const utilization = this.currentTaskCost / this.budget.maxCostPerTask;
    if (utilization >= this.budget.alertThreshold) {
      console.warn(
        `Budget warning: ${(utilization * 100).toFixed(1)}% of task budget used`
      );
    }
  }

  async recordUsage(cost: number): Promise<void> {
    this.currentTaskCost += cost;
    this.dailyCost += cost;
    this.monthlyCost += cost;

    // Persist to database
    await this.saveCostRecord({
      timestamp: new Date(),
      cost,
      taskCost: this.currentTaskCost,
      dailyCost: this.dailyCost,
      monthlyCost: this.monthlyCost,
    });
  }

  resetTaskCost(): void {
    this.currentTaskCost = 0;
  }

  getCostSummary(): CostSummary {
    return {
      task: this.currentTaskCost,
      day: this.dailyCost,
      month: this.monthlyCost,
      budget: this.budget,
      utilization: {
        task: this.currentTaskCost / this.budget.maxCostPerTask,
        day: this.budget.maxCostPerDay
          ? this.dailyCost / this.budget.maxCostPerDay
          : null,
        month: this.budget.maxCostPerMonth
          ? this.monthlyCost / this.budget.maxCostPerMonth
          : null,
      },
    };
  }
}
```

## Load Balancing and Failover

### Fallback Chain Configuration

```typescript
// packages/core/src/llm/fallback-manager.ts
export interface FallbackConfig {
  chains: FallbackChain[];
  retryStrategy: 'exponential' | 'linear';
  maxAttempts: number;
}

export interface FallbackChain {
  name: string;
  primary: ModelConfig;
  fallbacks: ModelConfig[];
}

export interface ModelConfig {
  model: string; // "claude-sonnet-4-5-20250929"
  provider: string; // "anthropic"
  maxRetries: number;
  timeout: number; // milliseconds
}

export class FallbackManager {
  private config: FallbackConfig;

  constructor(config: FallbackConfig) {
    this.config = config;
  }

  /**
   * Get fallback chain for task complexity
   */
  getChainForTask(task: AgentTask): FallbackChain {
    // Complex reasoning → Claude Sonnet
    if (task.complexity === 'high' || task.requiresReasoning) {
      return this.config.chains.find(c => c.name === 'reasoning');
    }

    // Code generation → Claude or GPT-4
    if (task.type === 'code') {
      return this.config.chains.find(c => c.name === 'coding');
    }

    // Fast iterations → Gemini Flash or Haiku
    if (task.requiresSpeed) {
      return this.config.chains.find(c => c.name === 'fast');
    }

    // Default chain
    return this.config.chains[0];
  }

  /**
   * Example fallback chains
   */
  static getDefaultChains(): FallbackChain[] {
    return [
      {
        name: 'reasoning',
        primary: {
          model: 'claude-sonnet-4-5-20250929',
          provider: 'anthropic',
          maxRetries: 3,
          timeout: 60000,
        },
        fallbacks: [
          {
            model: 'gpt-4o',
            provider: 'openai',
            maxRetries: 2,
            timeout: 45000,
          },
          {
            model: 'gemini-2.0-flash-thinking-exp',
            provider: 'google',
            maxRetries: 2,
            timeout: 30000,
          },
        ],
      },
      {
        name: 'coding',
        primary: {
          model: 'claude-sonnet-4-5-20250929',
          provider: 'anthropic',
          maxRetries: 3,
          timeout: 60000,
        },
        fallbacks: [
          {
            model: 'gpt-4o',
            provider: 'openai',
            maxRetries: 2,
            timeout: 45000,
          },
          {
            model: 'deepseek-coder-33b',
            provider: 'ollama', // Local fallback
            maxRetries: 1,
            timeout: 30000,
          },
        ],
      },
      {
        name: 'fast',
        primary: {
          model: 'gemini-2.0-flash-exp',
          provider: 'google',
          maxRetries: 2,
          timeout: 15000,
        },
        fallbacks: [
          {
            model: 'claude-haiku-4-20250514',
            provider: 'anthropic',
            maxRetries: 2,
            timeout: 20000,
          },
          {
            model: 'gpt-4o-mini',
            provider: 'openai',
            maxRetries: 1,
            timeout: 15000,
          },
        ],
      },
    ];
  }
}
```

## Subscription-First Integration

```typescript
// packages/core/src/llm/subscription-router.ts
export class SubscriptionFirstRouter {
  private litellm: LiteLLMClient;
  private subscriptionManager: SubscriptionManager;

  constructor(
    litellm: LiteLLMClient,
    subscriptionManager: SubscriptionManager
  ) {
    this.litellm = litellm;
    this.subscriptionManager = subscriptionManager;
  }

  /**
   * Route request: subscription → API fallback
   */
  async route(request: LLMRequest): Promise<LLMResponse> {
    // 1. Check subscription limits
    const subscriptionQuota =
      await this.subscriptionManager.getAvailableQuota();

    if (subscriptionQuota.hasQuota) {
      // Use subscription (Claude MAX, Cursor Pro, etc.)
      try {
        const response = await this.useSubscriptionAdapter(
          request,
          subscriptionQuota.provider
        );

        // Track subscription usage
        await this.subscriptionManager.recordUsage(
          subscriptionQuota.provider,
          response.usage.totalTokens
        );

        return response;
      } catch (error) {
        // Subscription failed → fallback to API
        console.warn(
          `Subscription provider ${subscriptionQuota.provider} failed, falling back to API`,
          error
        );
      }
    }

    // 2. Subscription exhausted or failed → use LiteLLM (API billing)
    console.log('Using LiteLLM API routing (subscription quota exhausted)');
    return await this.litellm.chat(request.messages, request.options);
  }

  private async useSubscriptionAdapter(
    request: LLMRequest,
    provider: string
  ): Promise<LLMResponse> {
    // Use subscription-based adapter (Claude Code, Cursor CLI, etc.)
    const adapter = this.subscriptionManager.getAdapter(provider);
    return await adapter.complete(request);
  }
}
```

## OpenTelemetry Observability

```typescript
// packages/core/src/llm/telemetry.ts
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

export class LLMTelemetry {
  private tracer = trace.getTracer('ado-llm');

  /**
   * Trace LLM completion call
   */
  async traceCompletion<T>(
    model: string,
    operation: () => Promise<T>
  ): Promise<T> {
    return await this.tracer.startActiveSpan(
      'llm.completion',
      async (span) => {
        span.setAttributes({
          'llm.model': model,
          'llm.provider': this.getProviderFromModel(model),
        });

        try {
          const startTime = Date.now();
          const result = await operation();

          // Record metrics
          span.setAttributes({
            'llm.latency_ms': Date.now() - startTime,
            'llm.tokens.total': result.usage?.totalTokens || 0,
            'llm.cost_usd': result.cost || 0,
          });

          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
          span.recordException(error);
          throw error;
        } finally {
          span.end();
        }
      }
    );
  }

  /**
   * Trace fallback chain execution
   */
  traceFallback(primaryModel: string, fallbackModel: string): void {
    const span = this.tracer.startSpan('llm.fallback');
    span.setAttributes({
      'llm.primary_model': primaryModel,
      'llm.fallback_model': fallbackModel,
    });
    span.end();
  }

  private getProviderFromModel(model: string): string {
    if (model.includes('claude')) return 'anthropic';
    if (model.includes('gpt')) return 'openai';
    if (model.includes('gemini')) return 'google';
    if (model.includes('mistral')) return 'mistral';
    return 'unknown';
  }
}
```

## Configuration

### ado.config.yaml

```yaml
llm:
  # LiteLLM routing configuration
  router:
    # Primary model for complex reasoning
    primary_model: claude-sonnet-4-5-20250929

    # Fallback chain
    fallback_models:
      - gpt-4o
      - gemini-2.0-flash-exp

    # Cost management
    budget:
      max_cost_per_task: 5.00  # USD
      max_cost_per_day: 100.00
      alert_threshold: 0.8  # 80%

    # Performance
    timeout: 60000  # 60 seconds
    max_retries: 3

    # Observability
    tracing:
      enabled: true
      export_to: jaeger  # or tempo, zipkin

  # Subscription-first routing
  subscription_priority:
    enabled: true
    providers:
      - name: claude_max
        type: subscription
        quota:
          requests_per_day: 1000
          tokens_per_request: 200000

      - name: cursor_pro
        type: subscription
        quota:
          requests_per_day: 500
          tokens_per_request: 100000

  # Provider API keys (for LiteLLM fallback)
  providers:
    anthropic:
      api_key: ${ANTHROPIC_API_KEY}
      enabled: true

    openai:
      api_key: ${OPENAI_API_KEY}
      enabled: true

    google:
      api_key: ${GOOGLE_AI_API_KEY}
      enabled: true

    ollama:
      base_url: http://localhost:11434
      enabled: true  # Local models
```

### Environment Variables

```bash
# .env
# =============================================================================
# LiteLLM Provider API Keys
# =============================================================================

# Required for API fallback
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=...

# Optional providers
MISTRAL_API_KEY=...
GROQ_API_KEY=...

# Ollama (local models)
OLLAMA_BASE_URL=http://localhost:11434

# Observability
OTEL_EXPORTER_JAEGER_ENDPOINT=http://localhost:14268/api/traces
```

## Usage Patterns

### Basic Chat Completion

```typescript
// Simple completion with automatic fallback
const client = new LiteLLMClient({
  primaryModel: 'claude-sonnet-4-5-20250929',
  fallbackModels: ['gpt-4o', 'gemini-2.0-flash-exp'],
});

const response = await client.chat([
  { role: 'user', content: 'Explain async/await in TypeScript' },
]);

console.log(response.content);
console.log(`Cost: $${response.cost.toFixed(4)}`);
console.log(`Model used: ${response.model}`);
```

### Streaming with Cost Tracking

```typescript
// Stream response with incremental cost tracking
const stream = client.chatStream([
  { role: 'user', content: 'Write a React component for user auth' },
]);

for await (const chunk of stream) {
  process.stdout.write(chunk.content);
}

const costSummary = client.getCostSummary();
console.log(`\nTotal cost: $${costSummary.task.toFixed(4)}`);
```

### Task-Based Routing

```typescript
// Automatic model selection based on task
const router = new SubscriptionFirstRouter(litellm, subscriptionManager);
const fallbackManager = new FallbackManager({
  chains: FallbackManager.getDefaultChains(),
});

const task: AgentTask = {
  type: 'code',
  complexity: 'high',
  requiresReasoning: true,
};

const chain = fallbackManager.getChainForTask(task);
const response = await router.route({
  messages: [{ role: 'user', content: task.prompt }],
  options: { model: chain.primary.model },
});
```

## Performance Characteristics

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    LiteLLM Performance Metrics                               │
└─────────────────────────────────────────────────────────────────────────────┘

Operation                 Latency (p50)    Latency (p99)    Overhead
────────────────────────────────────────────────────────────────────────────
Direct API call           1000ms           2500ms           0ms (baseline)
LiteLLM routing           1020ms           2550ms           +20ms
Fallback (1 retry)        2100ms           5200ms           +1100ms
Cost calculation          <1ms             <5ms             negligible
OpenTelemetry tracing     <5ms             <20ms            negligible

Cost Savings (Subscription-First):
─────────────────────────────────────────────────────────────────────────────
Scenario: 1000 requests/day, avg 50k tokens per request

Option A: Pure API billing
  - Claude Sonnet 4.5: $3.00 per 1M input tokens
  - Cost: (1000 × 50k × $3.00) / 1M = $150/day

Option B: Subscription-first (Claude MAX $40/mo)
  - Subscription covers ~800 requests/day
  - Remaining 200 via API: $30/day
  - Total: $40/mo + $30/day × 30 = $940/month

Savings: $4,500/month - $940/month = $3,560/month (79% reduction)
```

## Error Handling

```typescript
// packages/core/src/llm/errors.ts
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly context?: {
      model?: string;
      provider?: string;
      retries?: number;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

export class BudgetExceededError extends LLMError {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

export class RateLimitError extends LLMError {
  constructor(
    message: string,
    public readonly retryAfter: number // seconds
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// Usage with automatic retry
try {
  const response = await client.chat(messages);
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(`Rate limited, retry after ${error.retryAfter}s`);
    await sleep(error.retryAfter * 1000);
    // LiteLLM handles automatic retry
  } else if (error instanceof BudgetExceededError) {
    console.error('Task budget exceeded, halting execution');
    throw error;
  } else if (error instanceof LLMError) {
    console.error(`LLM error after all fallbacks: ${error.message}`);
    throw error;
  }
}
```

---

## Souvislosti

- [Subscription Router](../../03-architecture/03-component-diagrams/orchestrator-core.md)
- [Temporal Workflows](../02-autonomous-workflow/temporal-workflows.md)
- [Cost Tracking](../../07-operations/02-monitoring/metrics.md)
- [NFR-001: Performance](../../02-requirements/02-non-functional/NFR-001-performance.md)

# Agentic Development Orchestrator (ADO)
## Technical Specification v1.1

**Version:** 1.1 | **Date:** November 2025 | **Author:** DX Heroes

---

## Executive Summary

The **Agentic Development Orchestrator (ADO)** is a TypeScript-based platform that unifies multiple AI coding agents—Claude Code, Gemini CLI, Cursor CLI, GitHub Copilot, and others—behind a single, consistent interface. It enables parallel agent execution, intelligent task routing, persistent state management, and human-in-the-loop workflows for autonomous software development.

**Why it matters:** Organizations using multi-agent architectures achieve **25-30% productivity gains** and up to **50% reduction in time-to-market**. The current landscape offers either provider-specific tools or general-purpose frameworks but lacks a production-ready orchestrator purpose-built for software development that abstracts all major coding agents.

**Core value proposition:** Developers define tasks once; ADO intelligently routes them to the most appropriate agent, handles rate limits and failover automatically, maintains project context across sessions, and enables parallel execution with Git worktree isolation—all deployable locally or on Kubernetes with the same CLI interface.

**Key Innovation - Subscription-First Routing:** ADO prioritizes subscription-based tools (Claude MAX, Cursor Pro, Copilot Pro) over API billing, maximizing value from existing subscriptions before falling back to pay-per-token APIs.

---

## Existing Solutions Analysis

### Direct Competitors

| Solution | Stars | Strengths | Limitations | Verdict |
|----------|-------|-----------|-------------|---------|
| **Emdash** | 777 | 15+ CLI providers, Git worktree isolation | No intelligent routing, no subscription management | **Potential base to extend** |
| **Claude-Flow** | — | Multi-agent swarms, MCP tools | Claude-only, not provider-agnostic | Claude-specific only |
| **LiteLLM** | 31.6k | 100+ LLM providers, load balancing | Gateway only—not agent orchestration | **Use as LLM routing layer** |
| **CrewAI** | High | Role-based agents, enterprise support | General-purpose, not coding-optimized | Framework reference |

### Build vs. Buy Analysis

**Recommendation: Build on existing components**

- **Extend Emdash patterns** for multi-agent execution and worktree isolation
- **Integrate LiteLLM** as the LLM gateway layer for API-based routing
- **Use Mastra.ai patterns** for TypeScript agent abstractions
- **Build custom**: Subscription-First routing, provider management, HITL interface

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Developer Interface Layer                           │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  CLI (ado)  │  │  MCP Server  │  │  REST API    │  │  Web Dashboard  │  │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘  │
└─────────┼────────────────┼─────────────────┼───────────────────┼────────────┘
          └────────────────┴─────────────────┴───────────────────┘
                                    │
┌───────────────────────────────────▼─────────────────────────────────────────┐
│                            Orchestrator Core                                 │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────────────────┐ │
│  │  Task Router    │  │  Agent Scheduler │  │  State Machine              │ │
│  │  (intent→agent) │  │  (parallel exec) │  │  (workflow engine)          │ │
│  └────────┬────────┘  └────────┬─────────┘  └─────────────┬───────────────┘ │
│           │                    │                          │                  │
│  ┌────────▼────────────────────▼──────────────────────────▼───────────────┐ │
│  │                    Provider Manager                                     │ │
│  │  • Subscription-First Routing  • Rate Limit Tracking  • Auto-Failover │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                        HITL Controller                                  │ │
│  │  • Approval queues  • Interrupt/Resume  • Escalation  • Audit trail    │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────────────────┐
│                          Agent Adapter Layer                                 │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ │
│  │Claude Code │ │Gemini CLI  │ │Cursor CLI  │ │GitHub      │ │  Codex     │ │
│  │  Adapter   │ │  Adapter   │ │  Adapter   │ │Copilot CLI │ │  Adapter   │ │
│  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ │
│        │              │              │              │              │         │
│  ┌─────▼──────────────▼──────────────▼──────────────▼──────────────▼──────┐ │
│  │                      Execution Environment                              │ │
│  │  • Git Worktree Isolation  • Docker Sandboxing  • Resource Limits      │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────────────────┐
│                          Persistence Layer                                   │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────────────────┐ │
│  │  State Store    │  │  Rate Limit      │  │  Event Store                │ │
│  │  (PostgreSQL/   │  │  Tracker         │  │  (audit log)                │ │
│  │   SQLite)       │  │  (Redis)         │  │                             │ │
│  └─────────────────┘  └──────────────────┘  └─────────────────────────────┘ │
│  Key: {project_id}:{repository_key}:{session_id}                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### Provider Management System

The Provider Management System is the heart of ADO's cost optimization. It distinguishes between **subscription-based** tools (fixed monthly cost) and **API-based** access (pay-per-token).

#### Access Mode Types

| Mode | Examples | Billing | Rate Limits |
|------|----------|---------|-------------|
| `subscription` | Claude MAX, Cursor Pro, Copilot Pro, Gemini Advanced | Monthly flat fee | Requests/day or tokens/period |
| `api` | Anthropic API, OpenAI API, Google AI API | Per-token/request | TPM/RPM quotas |
| `free` | Gemini CLI free tier, Copilot free | None | Strict daily limits |

#### Provider Configuration Interface

```typescript
interface ProviderConfig {
  id: string;
  enabled: boolean;  // Master switch - false = completely ignored
  
  accessModes: AccessModeConfig[];  // Ordered by priority
  
  capabilities: AgentCapabilities;
  contextFile?: string;  // CLAUDE.md, GEMINI.md, etc.
}

interface AccessModeConfig {
  mode: 'subscription' | 'api' | 'free';
  priority: number;  // Lower = higher priority (1 = try first)
  enabled: boolean;
  
  // Subscription-specific
  subscription?: {
    plan: string;  // 'max', 'pro', 'team', etc.
    rateLimits: {
      requestsPerDay?: number;
      requestsPerHour?: number;
      tokensPerDay?: number;
    };
    resetTime?: string;  // "00:00 UTC"
  };
  
  // API-specific  
  api?: {
    apiKey: string;
    baseUrl?: string;
    rateLimits: {
      requestsPerMinute: number;
      tokensPerMinute: number;
    };
    costPerMillion: {
      input: number;
      output: number;
    };
  };
}

interface AgentCapabilities {
  codeGeneration: boolean;
  codeReview: boolean;
  refactoring: boolean;
  testing: boolean;
  documentation: boolean;
  debugging: boolean;
  
  languages: string[];  // ['typescript', 'python', 'go', ...]
  maxContextTokens: number;
  supportsStreaming: boolean;
  supportsMCP: boolean;
  supportsResume: boolean;
}
```

#### Subscription-First Routing Logic

```
┌─────────────────────────────────────────────────────────────────┐
│                    Task Received                                 │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. Filter: enabled providers with required capabilities        │
│     (skip providers where enabled: false)                       │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Sort by access mode priority:                               │
│     subscription (priority 1) → free → api (lowest priority)   │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Check rate limit status for top provider                    │
│     ├─ Available → Execute task                                 │
│     └─ Rate limited → Try next provider in priority order       │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. All subscriptions exhausted?                                │
│     ├─ API fallback enabled → Switch to API (with cost warning)│
│     └─ API fallback disabled → Queue task for later             │
└─────────────────────────────────────────────────────────────────┘
```

#### Rate Limit Detection Interface

```typescript
interface RateLimitDetector {
  // Check current status without making a request
  getStatus(): Promise<RateLimitStatus>;
  
  // Parse rate limit info from response/error
  parseRateLimitError(error: Error): RateLimitInfo | null;
  
  // Estimate remaining capacity
  getRemainingCapacity(): Promise<{
    requests?: number;
    tokens?: number;
    resetsAt?: Date;
  }>;
  
  // Record usage for tracking
  recordUsage(usage: UsageRecord): Promise<void>;
}

interface RateLimitStatus {
  isLimited: boolean;
  reason?: 'daily_limit' | 'hourly_limit' | 'token_limit' | 'concurrent_limit';
  resetsAt?: Date;
  remainingRequests?: number;
  remainingTokens?: number;
}

interface UsageRecord {
  providerId: string;
  accessMode: 'subscription' | 'api' | 'free';
  timestamp: Date;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;  // Only for API mode
}
```

### Provider Registry

```typescript
interface ProviderRegistry {
  // Provider management
  register(config: ProviderConfig): void;
  unregister(providerId: string): void;
  
  get(providerId: string): ProviderConfig | undefined;
  getAll(): ProviderConfig[];
  getEnabled(): ProviderConfig[];
  
  // Enable/disable at runtime
  setEnabled(providerId: string, enabled: boolean): void;
  
  // Access mode management
  setAccessModeEnabled(
    providerId: string, 
    mode: 'subscription' | 'api' | 'free', 
    enabled: boolean
  ): void;
  
  // Priority management
  setPriority(providerId: string, mode: string, priority: number): void;
  
  // Find best available provider for task
  selectProvider(task: TaskDefinition): Promise<ProviderSelection>;
}

interface ProviderSelection {
  provider: ProviderConfig;
  accessMode: AccessModeConfig;
  reason: string;  // "subscription available" | "fallback to API" | etc.
  estimatedCost?: number;  // Only for API mode
}
```

### Orchestrator Core

```typescript
interface OrchestratorCore {
  // Task submission
  submit(task: TaskDefinition): Promise<TaskHandle>;
  
  // Task management
  pause(taskId: string): Promise<void>;
  resume(taskId: string, humanInput?: HumanInput): Promise<void>;
  cancel(taskId: string): Promise<void>;
  
  // Status and results
  status(taskId: string): Promise<TaskStatus>;
  subscribe(taskId: string): AsyncIterable<TaskEvent>;
  
  // Session management
  checkpoint(taskId: string): Promise<CheckpointId>;
  restore(checkpointId: CheckpointId): Promise<TaskHandle>;
}

interface TaskDefinition {
  prompt: string;
  projectKey: string;
  repositoryPath: string;
  
  // Provider preferences (optional)
  preferredProviders?: string[];  // ['claude-code', 'gemini-cli']
  excludeProviders?: string[];    // ['aider'] - never use these
  
  // Access mode preferences
  allowApiFailover?: boolean;  // Default: true
  maxApiCostUsd?: number;      // Budget limit for API fallback
  
  constraints?: TaskConstraints;
  hitlPolicy?: HITLPolicy;
}

interface TaskConstraints {
  maxDuration?: number;  // seconds
  maxTokens?: number;
  requiredCapabilities?: (keyof AgentCapabilities)[];
}
```

### Agent Adapters

Each adapter implements a common interface while handling provider-specific details:

```typescript
interface AgentAdapter {
  readonly id: string;
  readonly capabilities: AgentCapabilities;
  
  // Lifecycle
  initialize(config: AgentConfig): Promise<void>;
  isAvailable(): Promise<boolean>;
  
  // Execution
  execute(task: AgentTask): AsyncIterable<AgentEvent>;
  interrupt(): Promise<void>;
  
  // Rate limit integration
  getRateLimitDetector(): RateLimitDetector;
  
  // Context management
  getContextFile(): string;  // CLAUDE.md, GEMINI.md, etc.
  setProjectContext(context: ProjectContext): Promise<void>;
}
```

**Supported Agents:**

| Agent | CLI Command | Headless Flag | Context File | Session Resume |
|-------|-------------|---------------|--------------|----------------|
| Claude Code | `claude` | `-p` | CLAUDE.md, AGENTS.md | `--resume` |
| Gemini CLI | `gemini` | `-p` | GEMINI.md | N/A |
| Cursor CLI | `cursor-agent` | `-p` | .cursorrules | `--resume` |
| GitHub Copilot | `copilot` | Custom agents | .github/copilot-instructions.md | `--resume` |
| Codex CLI | `codex` | `exec` mode | AGENTS.md | `--last` |

### Human-in-the-Loop Interface

```typescript
interface HITLController {
  // Approval workflow
  requestApproval(request: ApprovalRequest): Promise<ApprovalDecision>;
  getPendingApprovals(filter?: ApprovalFilter): Promise<ApprovalRequest[]>;
  submitDecision(requestId: string, decision: ApprovalDecision): Promise<void>;
  
  // Interactive sessions
  interrupt(sessionId: string, reason: InterruptReason): Promise<void>;
  provideInput(sessionId: string, input: HumanInput): Promise<void>;
  
  // Escalation
  escalate(sessionId: string, channel: EscalationChannel): Promise<void>;
}

type HITLPolicy = 
  | 'autonomous'      // No human intervention
  | 'review-edits'    // Human reviews file changes before apply
  | 'approve-steps'   // Human approves each major step
  | 'manual'          // Human must approve every action

type EscalationChannel = 'slack' | 'email' | 'dashboard' | 'webhook';
```

---

## Configuration Schema

### Main Configuration File

**Location:** `ado.config.yaml` (project root) or `~/.config/ado/config.yaml` (global)

```yaml
# ado.config.yaml
version: "1.1"

# Project identification
project:
  id: "my-project"
  repository: "github.com/dxheroes/my-app"

# ============================================
# PROVIDER CONFIGURATION
# ============================================
# Each provider can be enabled/disabled independently.
# Access modes define how to connect (subscription vs API).
# Priority determines failover order (lower = tried first).

providers:
  claude-code:
    enabled: true
    contextFile: "CLAUDE.md"
    
    accessModes:
      # Priority 1: Use MAX subscription first
      - mode: subscription
        priority: 1
        enabled: true
        subscription:
          plan: "max"  # Options: free, pro, max, team
          rateLimits:
            # MAX plan limits (approximate, adjust based on actual)
            requestsPerDay: 500
            tokensPerDay: 5000000
          resetTime: "00:00 UTC"
      
      # Priority 2: Fall back to API when subscription exhausted
      - mode: api
        priority: 10
        enabled: true
        api:
          apiKey: ${ANTHROPIC_API_KEY}
          rateLimits:
            requestsPerMinute: 50
            tokensPerMinute: 100000
          costPerMillion:
            input: 3.00   # Claude Sonnet 4
            output: 15.00
    
    capabilities:
      codeGeneration: true
      codeReview: true
      refactoring: true
      testing: true
      documentation: true
      debugging: true
      languages: ["typescript", "python", "go", "rust", "java"]
      maxContextTokens: 200000
      supportsStreaming: true
      supportsMCP: true
      supportsResume: true
    
    defaultOptions:
      model: "claude-sonnet-4-20250514"
      maxTurns: 50
      permissionMode: "acceptEdits"

  gemini-cli:
    enabled: true
    contextFile: "GEMINI.md"
    
    accessModes:
      - mode: subscription
        priority: 2
        enabled: true
        subscription:
          plan: "advanced"
          rateLimits:
            requestsPerDay: 1000
          resetTime: "00:00 UTC"
      
      - mode: api
        priority: 11
        enabled: true
        api:
          apiKey: ${GOOGLE_API_KEY}
          rateLimits:
            requestsPerMinute: 60
            tokensPerMinute: 120000
          costPerMillion:
            input: 1.25
            output: 5.00
    
    capabilities:
      codeGeneration: true
      codeReview: true
      refactoring: true
      testing: true
      documentation: true
      debugging: true
      languages: ["typescript", "python", "go", "java", "kotlin"]
      maxContextTokens: 1000000
      supportsStreaming: true
      supportsMCP: true
      supportsResume: false
    
    defaultOptions:
      model: "gemini-2.5-pro"
      approvalMode: "auto_edit"

  cursor-cli:
    enabled: true
    contextFile: ".cursorrules"
    
    accessModes:
      - mode: subscription
        priority: 3
        enabled: true
        subscription:
          plan: "pro"
          rateLimits:
            requestsPerDay: 500
          resetTime: "00:00 UTC"
    
    capabilities:
      codeGeneration: true
      codeReview: true
      refactoring: true
      testing: false
      documentation: false
      debugging: true
      languages: ["typescript", "python", "javascript"]
      maxContextTokens: 128000
      supportsStreaming: true
      supportsMCP: true
      supportsResume: true

  copilot-cli:
    enabled: true
    contextFile: ".github/copilot-instructions.md"
    
    accessModes:
      - mode: subscription
        priority: 4
        enabled: true
        subscription:
          plan: "individual"  # individual, business, enterprise
          rateLimits:
            requestsPerDay: 300  # Premium requests
          resetTime: "00:00 UTC"
    
    capabilities:
      codeGeneration: true
      codeReview: true
      refactoring: true
      testing: true
      documentation: true
      debugging: false
      languages: ["typescript", "python", "go", "java", "c#"]
      maxContextTokens: 64000
      supportsStreaming: true
      supportsMCP: true
      supportsResume: true

  codex-cli:
    enabled: true
    contextFile: "AGENTS.md"
    
    accessModes:
      - mode: subscription
        priority: 5
        enabled: true
        subscription:
          plan: "pro"
          rateLimits:
            requestsPerDay: 200
          resetTime: "00:00 UTC"
    
    capabilities:
      codeGeneration: true
      codeReview: false
      refactoring: true
      testing: true
      documentation: false
      debugging: true
      languages: ["python", "typescript", "javascript"]
      maxContextTokens: 192000
      supportsStreaming: true
      supportsMCP: true
      supportsResume: true

  # Example: Disabled provider
  aider:
    enabled: false  # ← Completely ignored by orchestrator
    # ... rest of config if ever re-enabled

# ============================================
# ROUTING CONFIGURATION
# ============================================
routing:
  # Default routing strategy
  strategy: "subscription-first"  # subscription-first | round-robin | cost-optimized
  
  # Failover behavior
  failover:
    enabled: true
    onErrors: ["rate_limit", "timeout", "server_error"]
    maxRetries: 3
    retryDelay: 1000  # ms
    
  # API fallback settings
  apiFallback:
    enabled: true
    confirmAboveCost: 1.00  # Ask for confirmation if estimated cost > $1
    maxCostPerTask: 10.00   # Hard limit per task
    maxDailyCost: 50.00     # Hard limit per day
    
  # Task-to-provider matching
  matching:
    preferCapabilityMatch: true
    preferLargerContext: true
    preferFasterProvider: false

# ============================================
# ORCHESTRATION SETTINGS
# ============================================
orchestration:
  maxParallelAgents: 10
  worktreeIsolation: true
  checkpointInterval: 30  # seconds
  
  taskQueue:
    concurrency: 5
    retryAttempts: 3
    retryDelay: 1000

# ============================================
# HUMAN-IN-THE-LOOP
# ============================================
hitl:
  defaultPolicy: "review-edits"  # autonomous | review-edits | approve-steps | manual
  approvalTimeout: 24h
  
  # Cost-based escalation
  escalateOnCost:
    threshold: 5.00  # Escalate if API cost exceeds this
    channel: "slack"
  
  notifications:
    slack:
      enabled: true
      webhookUrl: ${SLACK_WEBHOOK_URL}
      channel: "#dev-agents"
    
    email:
      enabled: false

# ============================================
# STORAGE CONFIGURATION
# ============================================
storage:
  driver: "sqlite"  # sqlite | postgresql
  path: ".ado/state.db"  # For SQLite
  # connectionString: ${DATABASE_URL}  # For PostgreSQL
  
  rateLimitTracking:
    driver: "memory"  # memory | redis
    # redisUrl: ${REDIS_URL}

# ============================================
# OBSERVABILITY
# ============================================
observability:
  logging:
    level: "info"
    format: "pretty"  # pretty | json
  
  costTracking:
    enabled: true
    reportInterval: "daily"

# ============================================
# DEPLOYMENT CONTEXT
# ============================================
deployment:
  default: "local"
  
  contexts:
    local:
      type: "docker"
    
    kubernetes:
      type: "k8s"
      namespace: "ado-system"
      kubeconfig: ${KUBECONFIG}
```

### CLI Provider Override

```bash
# Use only specific providers for a task
ado run "Refactor auth module" --providers claude-code,gemini-cli

# Exclude specific providers
ado run "Fix bug" --exclude-providers aider,codex-cli

# Force subscription-only (no API fallback)
ado run "Generate tests" --no-api-fallback

# Force specific access mode
ado run "Complex refactor" --access-mode api --provider claude-code

# Set cost limit for API fallback
ado run "Large migration" --max-cost 25.00
```

---

## Functional Requirements

### FR-1: Provider Management
- **FR-1.1:** Enable/disable providers via configuration
- **FR-1.2:** Support multiple access modes per provider (subscription, API, free)
- **FR-1.3:** Track rate limits per provider and access mode
- **FR-1.4:** Automatic failover when rate limited
- **FR-1.5:** Cost tracking for API access modes

### FR-2: Subscription-First Routing
- **FR-2.1:** Prioritize subscription-based access over API
- **FR-2.2:** Detect rate limits from provider responses/errors
- **FR-2.3:** Track daily/hourly usage against known limits
- **FR-2.4:** Automatic switchover to next priority provider when limited
- **FR-2.5:** Optional API fallback with cost confirmation

### FR-3: Multi-Agent Task Execution
- **FR-3.1:** Execute tasks across enabled providers only
- **FR-3.2:** Support parallel execution with Git worktree isolation
- **FR-3.3:** Automatic agent selection based on task + availability
- **FR-3.4:** Graceful handling of agent unavailability

### FR-4: Task Orchestration
- **FR-4.1:** Sequential, parallel, and conditional workflows
- **FR-4.2:** Task decomposition with subtask generation
- **FR-4.3:** Progress tracking and streaming updates
- **FR-4.4:** Checkpoint/restore for long-running tasks

### FR-5: Project Context Management
- **FR-5.1:** Persistent context by `{project_id}:{repository_key}`
- **FR-5.2:** Automatic context file sync (CLAUDE.md, GEMINI.md, etc.)
- **FR-5.3:** Cross-session conversation history

### FR-6: Human-in-the-Loop
- **FR-6.1:** Configurable HITL policy per task
- **FR-6.2:** Interrupt/resume for autonomous tasks
- **FR-6.3:** Cost-based escalation
- **FR-6.4:** Multi-channel notifications

---

## Non-Functional Requirements

### NFR-1: Performance
- CLI startup time < 500ms
- Task submission latency < 100ms
- Streaming response initiation < 2s

### NFR-2: Developer Experience
- Zero-configuration startup with sensible defaults
- Intelligent shell auto-completion
- Colorful, informative CLI output
- Error messages include remediation steps
- Identical interface for local and K8s deployment

### NFR-3: Reliability
- 99.9% orchestrator uptime
- No data loss on unexpected shutdown
- Automatic recovery from agent failures

### NFR-4: Security
- Secrets never logged or persisted in plaintext
- Sandboxed agent execution
- Audit logging for all actions

---

## Task Breakdown with Milestones

### Milestone 1: MVP — Claude Code Integration (Weeks 1-3)

**Goal:** Functional CLI that can run Claude Code with subscription-first routing.

| Task ID | Description | Estimate |
|---------|-------------|----------|
| M1.1 | Project scaffolding (pnpm monorepo, tsup, Biome) | 2 days |
| M1.2 | CLI framework setup (Commander.js, @clack/prompts) | 2 days |
| M1.3 | Provider registry with enable/disable | 2 days |
| M1.4 | Claude Code adapter implementation | 3 days |
| M1.5 | Basic rate limit detection | 2 days |
| M1.6 | SQLite state persistence | 2 days |
| M1.7 | CLAUDE.md context file management | 1 day |
| M1.8 | Basic error handling and logging | 1 day |

**Deliverable:** 
```bash
ado run "Continue working on this ADO specification" --provider claude-code
```

### Milestone 2: Subscription-First Routing (Weeks 4-5)

**Goal:** Complete subscription management and automatic failover.

| Task ID | Description | Estimate |
|---------|-------------|----------|
| M2.1 | Access mode configuration schema | 2 days |
| M2.2 | Rate limit tracking system | 3 days |
| M2.3 | Subscription-first router | 3 days |
| M2.4 | API fallback with cost confirmation | 2 days |
| M2.5 | Cost tracking and reporting | 2 days |

**Deliverable:**
```bash
# Uses Claude MAX until rate limited, then prompts before API fallback
ado run "Large refactoring task" --max-cost 10.00
```

### Milestone 3: Multi-Agent Support (Weeks 6-9)

**Goal:** Full adapter coverage for all major coding agents.

| Task ID | Description | Estimate |
|---------|-------------|----------|
| M3.1 | Gemini CLI adapter | 3 days |
| M3.2 | Cursor CLI adapter | 3 days |
| M3.3 | GitHub Copilot CLI adapter | 3 days |
| M3.4 | Codex CLI adapter | 2 days |
| M3.5 | Capability-based task routing | 3 days |
| M3.6 | Parallel execution with worktree isolation | 3 days |

**Deliverable:**
```bash
ado run "Implement feature X" --strategy auto  # Selects best available
```

### Milestone 4: Orchestration Core (Weeks 10-12)

**Goal:** Workflow engine and task queue.

| Task ID | Description | Estimate |
|---------|-------------|----------|
| M4.1 | Task queue implementation (BullMQ) | 3 days |
| M4.2 | Workflow engine (sequential, parallel, branch) | 4 days |
| M4.3 | Checkpoint/restore functionality | 3 days |
| M4.4 | HITL approval system | 4 days |
| M4.5 | Progress streaming | 2 days |

**Deliverable:**
```bash
ado workflow run ./migration-workflow.yaml --hitl review-edits
```

### Milestone 5: Kubernetes Deployment (Weeks 13-15)

**Goal:** Production-ready K8s deployment.

| Task ID | Description | Estimate |
|---------|-------------|----------|
| M5.1 | Docker image (multi-stage build) | 2 days |
| M5.2 | Helm chart | 3 days |
| M5.3 | Context switching (local ↔ K8s) | 3 days |
| M5.4 | Distributed state (PostgreSQL + Redis) | 3 days |
| M5.5 | Horizontal scaling | 2 days |

**Deliverable:**
```bash
ado --context k8s run "Process 100 repos" --parallel 20
```

### Milestone 6: Production Polish (Weeks 16-18)

**Goal:** Enterprise features and documentation.

| Task ID | Description | Estimate |
|---------|-------------|----------|
| M6.1 | Web dashboard (React + Tailwind) | 5 days |
| M6.2 | Slack/email notifications | 2 days |
| M6.3 | OpenTelemetry integration | 2 days |
| M6.4 | Comprehensive documentation | 3 days |
| M6.5 | Performance optimization | 2 days |

---

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Language** | TypeScript 5.x | Type safety, Mastra alignment |
| **Runtime** | Node.js 22 LTS | Stable, native fetch |
| **Package Manager** | pnpm 9.x | Efficient, workspaces |
| **Bundler** | tsup (esbuild) | Fast, zero-config |
| **Linter/Formatter** | Biome | 25x faster than ESLint |
| **Test Framework** | Vitest | Fast, TS-native |
| **CLI Parser** | Commander.js | Lightweight, POSIX |
| **CLI Prompts** | @clack/prompts | Beautiful UI |
| **Database** | SQLite → PostgreSQL | Simple → Scale |
| **Queue** | BullMQ | Redis-backed, reliable |
| **Container** | Docker | Standard |
| **Orchestration** | Kubernetes | Production scaling |

---

## Getting Started (After MVP)

```bash
# Install
npm install -g @dxheroes/ado

# Initialize in project
cd my-project
ado init

# Configure providers (interactive)
ado config providers

# Run first task
ado run "Analyze this codebase and suggest improvements"

# Check status
ado status

# View cost report
ado report --costs --period today
```

---

## Appendix: Context File Templates

### CLAUDE.md Template

```markdown
# Project Context for Claude Code

## Project Overview
- Name: {{project.name}}
- Type: {{project.type}}
- Primary Language: {{project.language}}

## Coding Standards
- Use TypeScript strict mode
- Follow Biome formatting
- Write tests for all new functions

## Architecture
- Monorepo structure with pnpm workspaces
- Packages: core, cli, adapters, dashboard

## Current Focus
{{dynamically_updated_focus}}
```

### GEMINI.md Template

```markdown
# Gemini Context

## Project
{{project.name}} - {{project.description}}

## Guidelines
- Prefer functional programming patterns
- Use descriptive variable names
- Keep functions under 50 lines

## Restrictions
- Do not modify files in /vendor
- Do not commit directly to main
```

---

*This specification is designed to be self-improving: the MVP milestone enables ADO to continue developing itself using Claude Code.*

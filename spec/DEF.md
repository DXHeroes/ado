# Building ADO: Complete Technical Research for an Autonomous AI Coding Platform

**ADO (Agentic Development Orchestrator) should combine OpenHands' multi-agent architecture with Temporal.io's durable workflows, using LiteLLM for model routing and git worktrees for parallel agent isolation.** This research synthesizes findings from 9 autonomous coding systems, 5 orchestration frameworks, and 30+ tools to provide a complete technical blueprint. The recommended stack achieves reliability through event-sourced state persistence, security via Firecracker sandboxing, and flexibility through model-agnostic LLM routing.

---

## Autonomous AI coding has reached production maturity

The autonomous AI coding landscape matured dramatically in 2024-2025. **OpenHands leads SWE-bench benchmarks at 72.8% resolution rate**, proving that AI agents can autonomously resolve real-world GitHub issues. Devin demonstrated end-to-end autonomy with reported 8-12x efficiency gains at enterprises like Nubank. The common architectural pattern across successful systems follows an Observe-Orient-Decide-Act (OODA) loop: read state, plan next action, execute, evaluate results, iterate until quality gates pass.

Key architectural patterns from leading systems:

- **Multi-agent with microagents**: OpenHands uses specialized sub-agents for domain-specific tasks, coordinated by a central orchestrator
- **Agent-Computer Interface (ACI)**: SWE-agent installs custom tools optimized for LLM interaction, with history compression for context efficiency
- **Knowledge accumulation**: Devin and Windsurf implement "memories" that learn codebase patterns and team conventions over time
- **Quality gate integration**: All production systems integrate automated testing, linting, and build verification before PR creation

The sandbox isolation approach varies by system. OpenHands uses Docker containers with Kubernetes for scale. Devin operates in fully isolated cloud VMs with shell, editor, and browser. SWE-agent developed SWE-ReX for remote execution across Docker, Modal, or AWS. For ADO, **Firecracker MicroVMs provide the optimal security-performance tradeoff**—full kernel isolation with ~125ms startup time and ~5MB memory overhead per VM.

---

## Multi-agent coordination requires supervisor-worker patterns

Research across CrewAI, LangGraph, AutoGen, and MetaGPT reveals that **supervisor-worker orchestration delivers 90% performance improvements** through parallel exploration (per Anthropic research). The supervisor receives requests, decomposes into subtasks, delegates to workers, monitors progress, and synthesizes results.

**LangGraph emerges as the recommended orchestration framework** for its graph-based workflow control, strong state management with checkpointing, and conditional branching for dynamic task routing. MetaGPT's "assembly line" paradigm—simulating product managers, architects, and engineers—achieves 70-87% cost reduction versus single agents by using smaller specialized models for decomposed tasks.

Git worktrees provide essential isolation for parallel agent work. Each agent operates in a separate worktree on its own branch, with file edits and indexes completely isolated. Cursor's Parallel Agents feature demonstrates this pattern in production: creating worktrees is fast and space-efficient (shared git history), and each agent's changes merge cleanly to main. The recommended directory structure:

```
project/
├── main/                          # Primary worktree
│   └── .git/                      # Shared git directory
├── worktrees/
│   ├── agent-1-feature-auth/
│   ├── agent-2-feature-api/
│   └── agent-3-bugfix-123/
└── orchestrator/                  # Coordination layer
```

For merge conflict resolution, **AI-powered tools like reconcile-ai, GitKraken AI, and rizzler** can automatically resolve 80%+ of conflicts using strategy classification plus LLM-based resolution. Escalate to humans only for conflicts involving business logic, security code, or insufficient test coverage to validate the merge.

---

## Hybrid local-cloud architecture maximizes responsiveness and scale

VS Code Remote Development and GitHub Codespaces provide proven reference architectures for local CLI + cloud worker patterns. The local client handles UI rendering, user input, session management, and authentication tokens. Cloud workers execute agent tasks, run code in sandboxes, and make LLM API calls.

**Protocol selection should follow this pattern:**
- **WebSocket** for CLI↔Orchestrator streaming (agent logs, real-time progress)
- **gRPC** for Orchestrator↔Workers high-performance RPC
- **REST** for external API integrations (GitHub, GitLab)
- **SSE** for simple server-to-client updates when WebSocket overhead is unnecessary

For Kubernetes-native orchestration, **deploy agents as independent pods** with full isolation and independent scaling. This allows different LLMs for different tasks (cost/performance optimization) and component upgrades without workflow disruption. Use Kubernetes HPA (Horizontal Pod Autoscaler) based on job queue depth for elastic scaling.

AWS deployment recommendations for agent workers:
- **Orchestrator**: c6i.xlarge instances (2 On-Demand for reliability)
- **Agent workers**: g4dn.xlarge with Spot instances (90% cost savings for interruptible tasks)
- **Auto-scaling**: Min 1-2 baseline, scale on SQS queue depth, max 10-50 burst capacity
- **VPC**: Private subnets for workers, NAT Gateway for egress, ALB for ingress

Coolify works well for development/staging and self-hosted deployments, but requires manual server management—not ideal for dynamic auto-scaling. For production, **Kubernetes on AWS EKS or self-managed clusters** provide the necessary orchestration capabilities.

---

## Quality gates must run in parallel with structured error feedback

AI-generated code requires language-specific quality gates executed in parallel where possible. Type checking, linting, and formatting can run simultaneously; build and tests execute sequentially after those pass.

**Language-specific quality gate configurations:**

| Language | Type Check | Lint | Format | Test | Coverage Target |
|----------|-----------|------|--------|------|-----------------|
| TypeScript | `tsc --noEmit` | ESLint + typescript-eslint | Prettier | Jest/Vitest | ≥80% lines |
| Python | mypy (strict) or pyright | Ruff (`select = ["ALL"]`) | Ruff format | pytest | ≥80% lines |
| Go | `go build ./...` | golangci-lint | gofmt | `go test ./...` | ≥80% |
| Rust | `cargo check` | `cargo clippy -D warnings` | `cargo fmt --check` | `cargo test` | ≥80% |
| Java | Maven/Gradle | Checkstyle + SpotBugs | Google style | JUnit 5 + JaCoCo | ≥80% |

**The iteration feedback format is critical for AI to fix issues effectively.** Structure errors with tool name, type, file, line, column, message, error code, severity, and surrounding context. Include which checks passed to provide positive signal. Track iteration count and remaining budget.

Stuck detection should trigger after **3 iterations with the same error** (OpenHands' threshold). Use semantic similarity detection for near-identical errors. Escalation follows a hierarchy: retry with prompt variation → try different implementation approach → accept partial completion with TODOs → human escalation with detailed context.

**Qodo Cover-Agent** (formerly CodiumAI) provides the best open-source test generation approach—it only accepts tests that provably increase coverage using the TestGen-LLM methodology from Meta research.

---

## Documentation-first development improves code generation quality

Spec-Driven Development (SDD) has emerged as the dominant paradigm for AI-assisted coding. **GitHub's Spec-Kit (September 2025) implements a four-phase process**: `/specify` generates detailed specifications from high-level descriptions, `/plan` creates comprehensive technical implementation plans, `/tasks` breaks down into reviewable chunks, and `/implement` executes with focused reviews.

The "constitution" pattern ensures immutable principles apply to every generation: security requirements, design system constraints, architectural patterns, and integration standards. This context persists across all tasks while feature-specific specs provide targeted guidance.

**For API design, generate OpenAPI specifications before implementation.** Tools like IBM OpenAPI Generator, River OpenAPI Generator, and Kinde convert natural language requirements into production-ready specs. The spec then drives both server implementation and client SDK generation.

Architecture Decision Records (ADRs) using the MADR template capture decisions with context, decision drivers, considered options, and consequences. AI can auto-generate ADRs from significant commits/PRs, building institutional knowledge automatically.

For polyglot code generation, **use shared specifications** (OpenAPI, Protocol Buffers) to ensure cross-language consistency. Include language-specific style guides and idiom libraries in context. Let AI select idiomatic patterns per language while maintaining API contract compatibility.

Diagram generation works well with Mermaid syntax—it's GitHub-native and can be validated with Mermaid CLI before rendering. PlantUML provides more comprehensive UML support for enterprise documentation needs.

---

## Git workflows should default to PR-based with automated review

**PR-based workflows with automated AI review provide the optimal balance** of autonomy and safety. The pattern: issue assigned → agent creates branch (`agent/ado/<type>/<id>-<description>`) → agent commits atomically → draft PR opened → AI review (CodeRabbit/PR-Agent) → human approval → merge.

GitHub Apps provide superior integration over OAuth Apps: fine-grained permissions, short-lived auto-refreshing tokens, dedicated bot identity, built-in webhooks, and no GitHub Enterprise seat consumption. Request only necessary permissions: contents:write, pull_requests:write, issues:read, checks:write.

**PR-Agent (Qodo Merge) automates the full review workflow**: `/describe` generates PR descriptions, `/review` provides line-by-line feedback, `/improve` suggests code improvements, `/update_changelog` maintains changelogs. It learns team standards and enforces them during reviews.

Auto-approval should be limited to: documentation-only changes, dependency updates with passing tests, auto-formatted code, and changes below configurable thresholds. Always require human review for authentication/authorization code, database schema changes, API contract changes, and security-sensitive files.

For branch strategy, **trunk-based development with feature flags** correlates with high-performing teams (DORA metrics). Keep main as the central integration branch, always stable and deployable. Use short-lived feature branches merging quickly to main. Feature flags decouple deployment from release readiness.

---

## State persistence requires hybrid storage with durable checkpointing

**Temporal.io provides the gold standard for durable execution**—workflows survive crashes and restarts with automatic state persistence at every step. It handles retries, timeouts, and error handling natively. Human-in-the-loop integrates via signals that pause workflows for input.

The checkpoint pattern should persist:
- Task context (issue, requirements, constraints)
- Agent state (current step, accumulated context)
- Git state (branch, commits, modified files)
- Conversation history (compressed if exceeding limits)
- External references (PR IDs, CI status)

**Storage backend recommendation:**
- **Redis**: Active session state (sub-millisecond latency)
- **PostgreSQL**: Durable checkpoint storage (ACID compliance)
- **S3/GCS**: Large artifacts (diffs, generated files)

Human-in-the-loop detection should trigger after **5 iterations without progress** or **30 minutes for complex tasks**. LangGraph's `interrupt()` function pauses workflows for synchronous approvals. HumanLayer SDK enables async approvals via Slack/email for non-blocking escalation.

For recovery, implement idempotent operations throughout: check branch existence before creation, use deterministic commit messages with task IDs, verify PR existence before creation. On failure, restore from the last checkpoint with `git reset --hard`.

---

## Recommended technology stack and build decisions

The evaluation of 30+ tools yields clear recommendations:

**Model Routing: LiteLLM (USE)**
Unified API for 100+ providers with cost tracking, load balancing, automatic failover, and OpenAI-compatible response format. Essential for multi-model architecture without provider lock-in.

**Workflow Orchestration: Temporal.io (USE)**
Durable execution guarantees, automatic retry logic for flaky LLM calls, signals for human-in-the-loop, and excellent observability. Production-proven at Uber, Netflix, Stripe.

**Agent Framework: Pydantic AI + Claude Agent SDK (USE)**
Pydantic AI provides "FastAPI for agents" with full type safety and structured outputs. Claude Agent SDK provides battle-tested infrastructure from Anthropic for computer use and tool execution.

**Code Sandbox: E2B (USE)**
Secure Linux sandboxes for running untrusted AI-generated code with network isolation and configurable timeouts. Essential for safe agent code execution.

**Task Queue: BullMQ (CONSIDER)**
Use alongside Temporal for simple background tasks. Redis-backed with job priorities, delayed jobs, and horizontal scaling.

**CLI Framework: Typer + Rich (USE)**
Type hints define CLI args with automatic help generation. Rich provides beautiful terminal output with progress bars and syntax highlighting.

**Local Models: Ollama (USE)**
Essential for development and privacy-sensitive deployments. OpenAI-compatible API integrates seamlessly with LiteLLM.

**Build vs Buy summary:**
- **BUY**: Model routing (LiteLLM), orchestration (Temporal), structured outputs (Instructor), sandboxing (E2B), CLI (Typer)
- **BUILD**: Task-specific agents, workflow definitions, tool integrations, ADO-specific logic

---

## ADO architecture blueprint

```
┌─────────────────────────────────────────────────────────────────┐
│                         ADO Platform                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  CLI        │  │  Web UI     │  │  GitHub App Webhooks    │  │
│  │ (Typer/Rich)│  │ (optional)  │  │                         │  │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘  │
│         │                │                      │                │
│         └────────────────┴──────────────────────┘                │
│                          │ WebSocket                             │
│  ┌───────────────────────┴──────────────────────────────────┐   │
│  │              Orchestrator (Temporal Workflows)            │   │
│  │  • Spec generation  • Task decomposition  • Quality gates │   │
│  │  • Human-in-loop    • Checkpointing       • Recovery      │   │
│  └─────────────────────────┬────────────────────────────────┘   │
│                            │ gRPC                                │
│  ┌─────────────────────────┴────────────────────────────────┐   │
│  │                    LiteLLM Router                         │   │
│  │           ┌──────────┬───────────┬──────────┐            │   │
│  │           │ Claude   │  GPT-4    │  Ollama  │            │   │
│  │           └──────────┴───────────┴──────────┘            │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │                   Agent Worker Pool                        │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐          │   │
│  │  │ Planner    │  │ Coder      │  │ Reviewer   │          │   │
│  │  │ (Pydantic) │  │ (Claude    │  │ (Pydantic) │          │   │
│  │  │            │  │  Agent SDK)│  │            │          │   │
│  │  └────────────┘  └────────────┘  └────────────┘          │   │
│  │                        │                                   │   │
│  │  ┌─────────────────────┴───────────────────────────────┐  │   │
│  │  │     Git Worktree Manager (parallel isolation)       │  │   │
│  │  └─────────────────────────────────────────────────────┘  │   │
│  │                        │                                   │   │
│  │  ┌─────────────────────┴───────────────────────────────┐  │   │
│  │  │     E2B / Firecracker Sandbox (code execution)      │  │   │
│  │  └─────────────────────────────────────────────────────┘  │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │                    Storage Layer                          │   │
│  │  ┌──────────┐  ┌──────────────┐  ┌────────────────┐      │   │
│  │  │  Redis   │  │  PostgreSQL  │  │  S3/GCS        │      │   │
│  │  │ (active) │  │  (durable)   │  │  (artifacts)   │      │   │
│  │  └──────────┘  └──────────────┘  └────────────────┘      │   │
│  └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Critical implementation priorities

**Phase 1: Core Foundation**
1. Build CLI with Typer/Rich and basic command structure
2. Integrate LiteLLM for multi-model support
3. Implement single-agent code generation with quality gates
4. Add E2B sandboxing for safe code execution

**Phase 2: Orchestration**
1. Integrate Temporal for durable workflow execution
2. Implement checkpointing and recovery
3. Add human-in-the-loop with Slack notifications
4. Build spec-generation workflow (documentation-first)

**Phase 3: Multi-Agent**
1. Implement git worktree manager for parallel isolation
2. Deploy supervisor-worker agent pattern
3. Add conflict detection and AI-assisted merge resolution
4. Integrate PR-Agent for automated code review

**Phase 4: Production**
1. Deploy to Kubernetes with auto-scaling
2. Implement GitHub App for native integration
3. Add observability (OpenTelemetry via LiteLLM)
4. Build self-hosting installation path (Coolify support)

---

## Conclusion

Building ADO requires combining proven patterns from autonomous coding leaders with battle-tested infrastructure components. **The key insight from this research: reliability trumps raw capability.** OpenHands achieves 72.8% on SWE-bench not through better prompting alone, but through robust sandboxing, intelligent context compression, and systematic iteration loops.

The recommended architecture uses Temporal.io as the durability backbone—every LLM call, code execution, and quality gate becomes a recoverable activity that survives failures. LiteLLM provides the flexibility to route between Claude for complex reasoning, GPT-4 for breadth, and Ollama for cost-sensitive local development. Git worktrees enable the parallel agent pattern that makes multi-agent coordination practical rather than theoretical.

The documentation-first approach via GitHub's Spec-Kit methodology shifts AI from "generate code from vague prompts" to "implement precise specifications"—dramatically improving both quality and predictability. Combined with automated quality gates that iterate until success, ADO can achieve the autonomous development loop that current tools only partially deliver.

Most critically: **ADO should be designed to develop itself.** The repository structure, quality gates, and specification format should serve as both the product and the example. When ADO can reliably implement features in its own codebase based on specifications it generates, the platform will have proven its value proposition.
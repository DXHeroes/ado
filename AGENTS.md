# AGENTS.md - ADO Project Context

## General instructions
- use subagents
- use context7 to get documentation

## Project Overview

**Agentic Development Orchestrator (ADO)** is a TypeScript CLI tool that orchestrates multiple AI coding agents (Claude Code, Gemini CLI, Cursor CLI, GitHub Copilot, Codex) behind a unified interface.

## Key Innovation

**Subscription-First Routing**: The system prioritizes subscription-based access (Claude MAX, Cursor Pro, etc.) over API billing to maximize value from existing subscriptions before falling back to pay-per-token APIs.

## Current State

- **Phase**: Pre-development, specification complete
- **Next Step**: Milestone 1 - MVP implementation
- **Primary Document**: `ado-specification.md`

## Technology Stack

- **Language**: TypeScript 5.x with strict mode
- **Runtime**: Node.js 22 LTS
- **Package Manager**: pnpm 9.x (use `pnpm` not `npm`)
- **Bundler**: tsup (esbuild-based)
- **Linter/Formatter**: Biome (not ESLint/Prettier)
- **Testing**: Vitest
- **CLI Framework**: Commander.js + @clack/prompts

## Project Structure (Target)

```
ado/
├── packages/
│   ├── core/           # Orchestrator, router, state management
│   ├── cli/            # CLI application
│   ├── adapters/       # Agent adapters (claude, gemini, cursor, etc.)
│   └── shared/         # Shared types and utilities
├── ado.config.yaml     # Example configuration
├── package.json        # Root package.json (pnpm workspace)
├── pnpm-workspace.yaml
├── biome.json
└── tsconfig.json
```

## Coding Standards

1. **Use Biome** for linting and formatting (not ESLint)
2. **Strict TypeScript** - no `any` types unless absolutely necessary
3. **Functional patterns** - prefer pure functions, minimize classes
4. **Error handling** - use Result types or explicit error returns
5. **Documentation** - JSDoc for public APIs
6. **Testing** - unit tests for core logic, integration tests for adapters

## Key Interfaces to Implement

### ProviderConfig
```typescript
interface ProviderConfig {
  id: string;
  enabled: boolean;
  accessModes: AccessModeConfig[];
  capabilities: AgentCapabilities;
  contextFile?: string;
}
```

### AgentAdapter
```typescript
interface AgentAdapter {
  readonly id: string;
  readonly capabilities: AgentCapabilities;
  initialize(config: AgentConfig): Promise<void>;
  isAvailable(): Promise<boolean>;
  execute(task: AgentTask): AsyncIterable<AgentEvent>;
  interrupt(): Promise<void>;
  getRateLimitDetector(): RateLimitDetector;
}
```

## MVP Requirements (Milestone 1)

1. ✅ Project scaffolding (pnpm monorepo, tsup, Biome)
2. ✅ CLI framework setup
3. ✅ Provider registry with enable/disable
4. ✅ Claude Code adapter
5. ✅ Basic rate limit detection
6. ✅ SQLite state persistence
7. ✅ CLAUDE.md context management

## Commands to Implement (MVP)

```bash
ado init              # Initialize project config
ado run <prompt>      # Execute task
ado status            # Show current status
ado config providers  # Configure providers
ado --help            # Show help
```

## Important Notes

- **Never use npm** - always use pnpm
- **Never use ESLint** - use Biome
- **Focus on DevEx** - CLI should be fast (<500ms startup), beautiful output
- **Subscription-first** - always check subscription limits before API fallback

## Testing Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm test             # Run tests
pnpm lint             # Run Biome
pnpm typecheck        # TypeScript check
```

## Current Task

Continue from the specification to implement Milestone 1 (MVP). Start with:
1. Initialize pnpm monorepo structure
2. Configure Biome and TypeScript
3. Create basic CLI skeleton
4. Implement Claude Code adapter

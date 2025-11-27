# Project Context for Cursor

## Project Overview

**Agentic Development Orchestrator (ADO)** is a TypeScript CLI tool that orchestrates multiple AI coding agents (Claude Code, Gemini CLI, Cursor CLI, GitHub Copilot, Codex) behind a unified interface.

## Technology Stack

- **Language**: TypeScript 5.x with strict mode
- **Runtime**: Node.js 22 LTS
- **Package Manager**: pnpm 9.x (use `pnpm` not `npm`)
- **Bundler**: tsup (esbuild-based)
- **Linter/Formatter**: Biome (not ESLint/Prettier)
- **Testing**: Vitest
- **CLI Framework**: Commander.js + @clack/prompts

## Coding Standards

1. **Use Biome** for linting and formatting (not ESLint)
2. **Strict TypeScript** - no `any` types unless absolutely necessary
3. **Functional patterns** - prefer pure functions, minimize classes
4. **Error handling** - use Result types or explicit error returns
5. **Documentation** - JSDoc for public APIs
6. **Testing** - unit tests for core logic, integration tests for adapters

## Project Structure

```
ado/
├── packages/
│   ├── core/           # Orchestrator, router, state management
│   ├── cli/            # CLI application
│   ├── adapters/       # Agent adapters (claude, gemini, cursor, etc.)
│   ├── shared/         # Shared types and utilities
│   ├── api/            # REST API server
│   ├── dashboard/      # Web dashboard
│   └── mcp-server/     # MCP server
├── ado.config.yaml     # Example configuration
└── pnpm-workspace.yaml
```

## Key Architecture Components

1. **Provider Registry** - Manages enabled/disabled providers with capabilities
2. **Provider Router** - Subscription-first routing logic
3. **Rate Limit Tracker** - Tracks usage against subscription/API limits
4. **Cost Tracker** - API cost tracking and budget enforcement
5. **Agent Adapters** - Unified interface for each AI coding agent
6. **State Store** - SQLite/PostgreSQL for persistence
7. **HITL Controller** - Human-in-the-loop approval workflows
8. **Workflow Engine** - YAML-based task orchestration

## Important Notes

- **Never use npm** - always use pnpm
- **Never use ESLint** - use Biome
- **Focus on DevEx** - CLI should be fast (<500ms startup), beautiful output
- **Subscription-first** - always check subscription limits before API fallback

## Guidelines

- Prefer functional programming patterns
- Use descriptive variable names
- Keep functions under 50 lines
- Write clear, concise comments for complex logic
- Always handle errors explicitly
- Use custom `AdoError` class for error handling

## Restrictions

- Do not modify files in /node_modules
- Do not commit directly to main
- Always run tests before committing
- Follow the existing code style
- Use explicit file extensions (.js) in imports

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm test             # Run tests
pnpm lint             # Run Biome
pnpm typecheck        # TypeScript check
```

## Key Features

1. **Subscription-First Routing** - Maximize subscription value before API usage
2. **Multi-Agent Orchestration** - Coordinate multiple AI agents
3. **Cost Awareness** - Track and control API costs
4. **Workflow Engine** - Define complex multi-step tasks
5. **Human-in-the-Loop** - Configurable approval workflows
6. **Kubernetes Support** - Deploy locally or on K8s cluster
